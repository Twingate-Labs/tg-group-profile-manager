import {BaseProfile} from "./BaseProfile.mjs";
import {SlackProfileManager} from "../SlackProfileManager.mjs";

export class SelfServeApproval extends BaseProfile {
    constructor(app, profileConfig, index) {
        super(app, profileConfig, index)
        this.groups = this.groups || [];
        // Called when user selects a selfServe profile
        app.action(`select_profile-${index}`, this.selectProfile.bind(this));

        // called when a user submits a selfServer request
        app.view(`access_request-${index}`, this.submitAccessRequest.bind(this));

    }

    async getAppHomeBlock(tgUser) {
        const userGroupNames = tgUser.groups.map(group => group.name);
        const groupOptions = this.groups.filter(group => !userGroupNames.includes(group))
        let currentActiveGroupsString = groupOptions.join(", ")
        if (!currentActiveGroupsString) {
            currentActiveGroupsString = "None"
        }

        return {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `*Profile: ${this.profileName}* (Request Access)\nOptions: ${currentActiveGroupsString}`
            },
            "accessory": {
                "type": "button",
                "action_id": `select_profile-${this.profileIndex}`,
                "text": {
                    "type": "plain_text",
                    "emoji": true,
                    "text": "Request"
                },
                "value": `${this.profileName}`
            }
        }
    }

    async selectProfile({body, context, ack, logger}) {
        await ack();
        try {
            const tgUser = await this.app.lookupTgUserFromSlackUserId(body.user.id);
            const userGroupNames = tgUser.groups.map(group => group.name);

            // Make sure user is allowed to access profile
            if (!userGroupNames.includes(this.applicableToGroup)) {
                logger.error(new Error(`User '${tgUser.email}' has no access to profile '${this.profileName}'`));
                return;
            }

            const view = await this.openModal(tgUser);
            await this.app.client.views.open({
                token: context.botToken,
                trigger_id: body.trigger_id,
                view: view
            })
        } catch (e) {
            logger.error(e);
        }
    }

    async openModal(tgUser) {
        let modal = {
            type: 'modal',
            callback_id: `access_request-${this.profileIndex}`,
            title: {
                type: 'plain_text',
                // Not making Profile Name Part of the title as the title has a maximum of 25 chars restriction
                text: `Request New Group Access`
            },
            submit: {
                type: 'plain_text',
                text: 'Submit'
            },
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `Which group would you like to request access to?`
                    },
                    accessory: {
                        type: "static_select",
                        action_id: "request_access",
                        options: []
                    }
                }
            ]
        }
        const userGroupNames = tgUser.groups.map(group => group.name)

        for (const group of this.groups) {
            // skip if the user already in the group
            if (userGroupNames.includes(group)) continue
            const option = {
                text: {
                    type: "plain_text",
                    text: group
                },
                value: JSON.stringify([group])
            }
            modal.blocks[0]["accessory"]["options"].push(option)
        }
        return modal;
    }

    // Called when user clicks to submit access request
    async submitAccessRequest({client, body, logger, ack}) {
        await ack();
        const selectedOption = Object.values(Object.values(body.view.state.values)[0])[0].selected_option;
        const [selectedGroup] = JSON.parse(selectedOption.value)
        try {
            const tgUser = await this.app.lookupTgUserFromSlackUserId(body.user.id);
            const userGroupNames = tgUser.groups.map(group => group.name)

            // Make sure user is allowed to access profile
            if (!userGroupNames.includes(this.applicableToGroup)) {
                logger.error(new Error(`User '${tgUser.email}' has no access to profile '${this.profileName}'`));
                return;
            }

            // Make sure user is allowed to access selected group
            if (typeof selectedGroup === "string" && !this.groups.includes(selectedGroup)) {
                logger.error(new Error(`User '${tgUser.email}' not allowed to access requested group '${selectedGroup}' in profile '${this.profileName}'`));
                return;
            }

            await this.submitRequest(client, selectedGroup, tgUser, body.user.id);

            await this.app.refreshHome(body.user.id, tgUser.email);

            logger.info(`User '${tgUser.email}' changed profile '${this.profileName}' to group '${selectedGroup}'`)
        } catch (error) {
            logger.error(error);
        }

    }

    // Apply oneOf profile change
    async submitRequest(client, selectedGroup, tgUser, slackUserId) {
        const profileManager = new SlackProfileManager(),
            userGroupNames = tgUser.groups.map(userGroup => userGroup.name);

        let messageString = ""

        // the user is part of the approver group
        if (userGroupNames.includes(this.approverGroup)){
            const groupId = await profileManager.lookupGroupByName(selectedGroup);
            await profileManager.addUserToGroup(groupId, tgUser.id)
            console.log(`User '${tgUser.email}' in profile '${this.profileName}' is part of the approver group '${this.approverGroup}', access request to group '${selectedGroup}' approved.`);

            // sending self approved message to user
            messageString = `The access request for group _'${selectedGroup}'_ from profile _'${this.profileName}'_ has been self approved. \n\n _Note: Group changes will be passed to any connected clients automatically without the need to disconnect and reconnect and this process can take ~20 seconds to pass through to connected clients._`
            let msgOption = {
                channel: slackUserId,
                text: messageString,
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: messageString
                        }
                    }
                ]
            }
            await client.chat.postMessage(msgOption)
        }

        // the user is not part of the approver group
        else {
            console.log(`User '${tgUser.email}' in profile '${this.profileName}', access request to group '${selectedGroup}' is send to group members of '${this.approverGroup}'.`);
        }
    };

}