import * as Hub from "../../hub"

import * as offset from "offset"

const MAX_OFFSET_COST = 1600
const TAG = "carbon"

export class OffsetAction extends Hub.Action {

  name = "offset"
  label = "Offset - Manage your Carbon Footprint"
  iconName = "offset/leaf.svg"
  description = "Offset your carbon footprint from within Looker!"
  supportedActionTypes = [Hub.ActionType.Cell, Hub.ActionType.Query]
  supportedFormats = [Hub.ActionFormat.JsonDetail]
  requiredFields = [{ tag: TAG }]
  params = [
    {
      name: "publicKey",
      label: "Cloverly Public Key",
      required: true,
      sensitive: true,
      description: "Public Key from https://cloverly.com",
    }, {
      name: "privateKey",
      label: "Cloverly Private Key",
      required: true,
      sensitive: true,
      description: "Private Key from https://cloverly.com",
    }, {
      name: "autoBuy",
      label: "Auto Accept Offsets",
      required: true,
      sensitive: false,
      description: "Automatically accept any offset price estimate returned by Cloverly?",
    },
  ]

  async execute(request: Hub.ActionRequest) {

    if (!request.formParams.autoBuy) {
      throw "Must specify auto acceptance settings."
    }

    const body = request.formParams.footprint

    let phoneNumbers: string[] = []
    switch (request.type) {
      case Hub.ActionType.Query:
        if (!(request.attachment && request.attachment.dataJSON)) {
          throw "Couldn't get data from attachment."
        }

        const qr = request.attachment.dataJSON
        if (!qr.fields || !qr.data) {
          throw "Request payload is an invalid format."
        }
        const fields: any[] = [].concat(...Object.keys(qr.fields).map((k) => qr.fields[k]))
        const identifiableFields = fields.filter((f: any) =>
          f.tags && f.tags.some((t: string) => t === TAG),
        )
        if (identifiableFields.length === 0) {
          throw `Query requires a field tagged ${TAG}.`
        }
        phoneNumbers = qr.data.map((row: any) => (row[identifiableFields[0].name].value))
        break

      case Hub.ActionType.Cell:
        const value = request.params.value
        if (!value) {
          throw "Couldn't get data from cell."
        }
        phoneNumbers = [value]
        break
    }

    const client = this.offsetClientFromRequest(request)

    let response
    try {
      await Promise.all(phoneNumbers.map(async (to) => {
        const message = {
          from: request.params.from,
          to,
          body,
        }
        return client.messages.create(message)
      }))
    } catch (e) {
      response = {success: false, message: e.message}
    }

    return new Hub.ActionResponse(response)
  }

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      label: "Auto Accept Estimate?",
      name: "autoAccept",
      required: true,
      type: "select",
      options: [
          { name: "yes", label: "Yes" },
          { name: "no", label: "No" },
          { name: "yes_with_threshold", label: "Yes, with threshold" },
        ],
      default: "yes_with_threshold"

    },
    {
      label: "Cost Threshold ($)",
      name: "cost_threshold",
      required: false,
      type: "string",
      default: "5"
    }]
    return form
  }

  private offsetClientFromRequest(request: Hub.ActionRequest) {
    return offset(request.params.publicKey, request.params.authToken)
  }

}

Hub.addAction(new OffsetAction())
