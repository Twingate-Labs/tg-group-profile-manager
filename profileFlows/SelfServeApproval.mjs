import {BaseProfile} from "./BaseProfile.mjs";

export class SelfServeApproval extends BaseProfile {


    async getAppHomeBlock(tgUser) {
        const userGroupNames = tgUser.groups.map(group => group.name);
        const currentActiveGroups = this.groups.filter(group => userGroupNames.includes(group))
        let currentActiveGroupsString = currentActiveGroups.join(", ")
        if (!currentActiveGroupsString) {
            currentActiveGroupsString = "None"
        }

        return {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `*Profile: ${this.profileName}* (Request Access)\nCurrent Group: ${currentActiveGroupsString}`
            },
            "accessory": {
                "type": "button",
                "action_id": `select_profile-${this.profileIndex}`,
                "text": {
                    "type": "plain_text",
                    "emoji": true,
                    "text": "Change"
                },
                "value": `${this.profileName}`
            }
        }
    }

}