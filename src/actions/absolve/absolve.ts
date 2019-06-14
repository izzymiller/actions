import * as Hub from "../../hub"

import * as httpRequest from "request-promise-native"

const CL_API_URL = "https://api.cloverly.app/2019-03-beta"
const TAG = "co2_footprint"
export class absolveAction extends Hub.Action {

  name = "absolve"
  label = "Absolve - Manage Your Carbon Footprint"
  iconName = "absolve/leaf.svg"
  description = "Offset your carbon footprint"
  supportedActionTypes = [Hub.ActionType.Cell]
  requiredFields = [{tag: TAG}]
  params = [
    {
      name: "privateKey",
      label: "Cloverly API Private Key",
      description: "API Token from https://dashboard.cloverly.app/dashboard/",
      required: true,
      sensitive: true,
    }, {
      name: "autoBuy",
      label: "Auto Accept Offsets",
      required: true,
      sensitive: false,
      description: "Automatically accept any offset price estimate returned by Cloverly?",
    },
  ]

  async execute(request: Hub.ActionRequest) {
    console.log(request)
    console.log(request.params)
    const footprint = Number(request.params.value)
    if (!footprint) {
      throw "Couldn't get data from cell."
    }

    if (!request.formParams.to) {
      throw "Needs a valid email address."
    }
    
    console.log(footprint)

    const options = {
      url: `${CL_API_URL}/purchases/carbon/`,
      headers: {
       'Content-type': 'application/json',
       'Authorization': `Bearer private_key:${request.params.privateKey}`,
      },
      json: true,
      resolveWithFullResponse: true,
      body: JSON.stringify({"weight":{"value":35,"units":"kg"}}),
    }

    try {
      const response = await httpRequest.post(options).promise()
      console.log(response)
      return new Hub.ActionResponse({ success: true,message: response })
    } catch (e) {
      return new Hub.ActionResponse({ success: false, message: e.message })
    }
  }

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      name: "to",
      label: "To Email Address",
      description: "e.g. test@example.com",
      type: "string",
      required: true,
    }, {
      name: "from",
      label: "From Email Address",
      description: "e.g. test@example.com",
      type: "string",
    }, {
      label: "Filename",
      name: "filename",
      type: "string",
    }, {
      label: "Subject",
      name: "subject",
      type: "string",
    }]
    return form
  }


  // private async validateCloverlyToken(token: string) {
  //   try {
  //     await httpRequest.get({
  //       url: `${CL_API_URL}/account`,
  //       headers: {
  //         Authorization: `Token ${token}`,
  //       },
  //       json: true,
  //     }).promise()
  //   } catch (e) {
  //     throw new Error("Invalid token")
  //   }
  // }

  // private prettyAbsolveError(e: Error) {
  //   if (e.message === "Invalid token") {
  //     return "Your Cloverly API token is invalid."
  //   }
  //   return e.message
  // }
}

Hub.addAction(new absolveAction())