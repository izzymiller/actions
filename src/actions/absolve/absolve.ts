import * as Hub from "../../hub"

import * as httpRequest from "request-promise-native"

const CL_API_URL = "https://api.cloverly.app/2019-03-beta"
const TAG = "co2_footprint"

export class absolveAction extends Hub.Action {

  name = "absolve"
  label = "Purchase carbon offsets"
  iconName = "absolve/leaf.svg"
  description = "Offset your carbon footprint"
  supportedActionTypes = [Hub.ActionType.Cell]
  requiredFields = [{tag: TAG}]
  params = [
    {
      name: "privateKey",
      label: "Cloverly API Private Key",
      description: "API Token from https://dashboard.cloverly.app/dashboard",
      required: true,
      sensitive: true,
    },
    {
      name: "use_full_data_pipeline",
      label: "Use data pipeline to push purchased offset data back into a BigQuery connection",
      description: "Select Yes to use the full data pipeline included. Requires setup per: README.MD",
      required: true,
      type: "select",
      sensitive: false,
      options: [
        {name: "no", label: "No"},
        {name: "yes", label: "Yes"},
      ],
      default: "yes",
    },
    {
      name: "bucketName",
      label: "GCS Bucket Name- Optional",
      description: "Only required if you are using the full data pipeline ",
      required: false,
      default: "absolve_bucket",
      sensitive: false,
    },
    {
      name: "datasetId",
      label: "BQ DatasetID- Optional",
      description: "Only required if you are using the full data pipeline",
      required: false,
      default: "offset_purchases",
      sensitive: false,
    },
    {
      name: "tableId",
      label: "BQ Table Name",
      description: "Only required if you are using the full data pipeline",
      required: false,
      default: "offsets",
      sensitive: false,
    },
  ]

  async execute(request: Hub.ActionRequest) {
    const footprint = Number(request.params.value)
    if (!footprint) {
      throw "Couldn't get data from cell."
    }

    if (request.formParams.useThreshold == "yes" && !request.formParams.costThreshold && !request.formParams.percentThreshold) {
      throw "Threshold use required, but no thresholds set!"
    }

    ///First get an estimate to compare to our thresholds
    const estimate_options = {
      url: `${CL_API_URL}/estimates/carbon/`,
      headers: {
       'Content-type': 'application/json',
       'Authorization': `Bearer private_key:${request.params.privateKey}`,
      },
      json: true,
      resolveWithFullResponse: true,
      body: {'weight':{'value':footprint,'units':'kg'}},
    }

    try {
      const response = await httpRequest.post(estimate_options).promise()
      let estimateCost = parseInt(response.body.total_cost_in_usd_cents)
      let estimateSlug = response.body.slug
      console.log("Estimate successfully returned:",estimateCost)
      
      ///Takes the smallest threshold value and sets that as the maximum allowable offset cost
      if (request.formParams.costThreshold && !request.formParams.percentThreshold || Number(request.formParams.percentThreshold) < .001) {
        var threshold = Number(request.formParams.costThreshold)
      } else if (!request.formParams.costThreshold && request.formParams.percentThreshold) {
        var threshold = Number(request.formParams.percentThreshold)*2000
      } else if (request.formParams.costThreshold && request.formParams.percentThreshold) {
        var threshold = Math.min(Number(request.formParams.costThreshold),(Number(request.formParams.percentThreshold)*2000))
      } else {
        var threshold = Number(undefined)
      }
      
      ///Check estimate against thresholds
      if (estimateCost < threshold || request.formParams.useThresholds == "no") {

      ///If estimate is within bounds, convert to purchase

        const purchase_options = {
          url: `${CL_API_URL}/purchases/`,
          headers: {
           'Content-type': 'application/json',
           'Authorization': `Bearer private_key:${request.params.privateKey}`,
          },
          json: true,
          resolveWithFullResponse: true,
          body: {'estimate_slug':estimateSlug},
        }
        ///Convert estimate to purchase
        try {
          const response = await httpRequest.post(purchase_options).promise()
          let cost = response.body.total_cost_in_usd_cents
          console.log("You have successfully offset your footprint of",footprint, ", spending",cost,"with a threshold of", threshold,",!")


          ///If full pipeline is enabled, send a webhook to refresh the record in the offset database
          if(request.params.use_full_data_pipeline == "yes") {
            const refresh_options = {
              url: `https://us-central1-absolve.cloudfunctions.net/refresh_offset_data`,
              headers: {
              'Content-type': 'application/json',
              },
              json: true,
              resolveWithFullResponse: true,
              body: {'bucketName': request.params.bucketName,'datasetId': request.params.datasetId,'tableId': request.params.tableId},
            }
            await httpRequest.post(refresh_options).promise()
            console.log('Dataset refreshed successfully')
          }
          return new Hub.ActionResponse({ success: true,message: response })
        } catch (e) {
          console.log("Failure with purchase execution")
          return new Hub.ActionResponse({ success: false, message: e.message })
        }

      ///If the estimate was not explicitly accepted, default to failure.
      } else {
        console.log("Estimate for offset (${estimateCost}) was greater than threshold (${threshold}). Increase threshold or decrease offset quantity.")
        return new Hub.ActionResponse({ success: false, message: "Estimate for offset (${estimateCost}) was greater than threshold (${threshold}). Increase threshold or decrease offset quantity." })
      }
    ///Catch failures with the entire thing
    } catch (e) {
      console.log("Failure getting & checking estimate ")
      return new Hub.ActionResponse({ success: false, message: e.message })
    }
  }


  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      label: "Use Thresholds?",
      name: "useThresholds",
      required: true,
      type: "select",
      options: [
        {name: "no", label: "No"},
        {name: "yes", label: "Yes"},
      ],
      default: "yes",
    },
    {
      label: "Threshold: Percentage of Total Gross Margin (optional)",
      name: "percentThreshold",
      description: "Limits your offset cost at a percentage of the Total Gross Margin associated with the current grouping. Requires TGM field to be in-query",
      required: false,
      type: "string",
      default: "2"
    },
    {
     label: "Threshold: Manual Dollar Value (optional)",
      name: "costThreshold",
      description: "Limits your offset cost at the dollar value specified here. If set, overrides TGM threshold.",
      required: false,
      type: "string",
      default: "200",
    },
    {
      label: "Advanced: Offset Type",
       description: "Type of REC. Recommended left blank for optimal price matching.",
       name: "offsetType",
       required: false,
       type: "select",
       options: [
        {name: "wind", label: "Wind"},
        {name: "solar", label: "Solar"},
        {name: "biomass", label: "Biomass"},
        {name: "solar", label: "Solar"},
        {name: "", label: ""}
      ],
       default: "wind",
     },
    ]
    return form
  }
}

Hub.addAction(new absolveAction())