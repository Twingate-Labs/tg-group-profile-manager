import {BaseProfile} from "./BaseProfile.mjs";
import {SlackProfileManager} from "../SlackProfileManager.mjs";

export class SelfServeApproval extends BaseProfile {
    constructor(app, profileConfig, index) {
        profileConfig.title = 'Reqeust Access';
        super(app, profileConfig, index)
        this.groups = this.groups || [];
        // Called when user selects a selfServe profile
        app.action(`select_profile-${index}`, this.selectProfile.bind(this));

        // called when a user submits a selfServer request
        app.view(`submit_profile-${index}`, this.submitAccessRequest.bind(this));

        // called when an approver approves a request
        app.view(`approve_request-${index}`, this.approveAccessRequest.bind(this));

        // called when an approver rejects a request
        app.view(`reject_request-${index}`, this.rejectAccessRequest.bind(this));


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


    async openModal(tgUser) {
        let modal = await super.openModal(tgUser);
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
        } catch (error) {
            logger.error(error);
        }

    }

    // Apply oneOf profile change
    async submitRequest(client, selectedGroup, tgUser, slackUserId) {
        const profileManager = new SlackProfileManager(),
            userGroupNames = tgUser.groups.map(userGroup => userGroup.name),
            groupId = await profileManager.lookupGroupByName(selectedGroup);
        let messageString = ""

        // the user is part of the approver group
        if (userGroupNames.includes(this.approverGroup)){
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
            const approverGroup = await profileManager.lookUpGroupUsersByName(this.approverGroup)
            let msgOption = {}
            for (const approver of approverGroup.users) {
                try {
                    const approverSlackInfo = await client.users.lookupByEmail({email: approver.email})

                    // approver slack message
                    msgOption = {
                        channel: approverSlackInfo.user.id,
                        text: `Approval is requested by <@${slackUserId}>`,
                        blocks: [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `<@${slackUserId}> is requesting access to group _'${selectedGroup}'_ through profile _'${this.profileName}'_.`
                                }
                            },
                            {
                                type: 'actions',
                                elements: [
                                    {
                                        action_id: `approve_request-${this.profileIndex}`,
                                        type: 'button',
                                        text: {
                                            type: 'plain_text',
                                            text: 'Approve',
                                            emoji: true
                                        },
                                        style: 'primary',
                                        confirm: {
                                            "title": {
                                                "type": "plain_text",
                                                "text": "Are you sure?"
                                            },
                                            "text": {
                                                "type": "mrkdwn",
                                                "text": `Are you sure you want to *APPROVE* the request to add user <@${slackUserId}> to the Twingate group '${selectedGroup}'?`
                                            },
                                            "confirm": {
                                                "type": "plain_text",
                                                "text": "Do it"
                                            },
                                            "deny": {
                                                "type": "plain_text",
                                                "text": "Stop, I've changed my mind!"
                                            }
                                        },
                                        value: `${slackUserId}++${this.profileName}++${selectedGroup}++${groupId}`
                                    },
                                    {
                                        action_id: 'reject_request',
                                        type: 'button',
                                        text: {
                                            type: 'plain_text',
                                            text: 'Reject',
                                            emoji: true
                                        },
                                        style: 'danger',
                                        confirm: {
                                            "title": {
                                                "type": "plain_text",
                                                "text": "Are you sure?"
                                            },
                                            "text": {
                                                "type": "mrkdwn",
                                                "text": `Are you sure you want to *Reject* the request to add user <@${slackUserId}> to the Twingate group '${selectedGroup}'?`
                                            },
                                            "confirm": {
                                                "type": "plain_text",
                                                "text": "Do it"
                                            },
                                            "deny": {
                                                "type": "plain_text",
                                                "text": "Stop, I've changed my mind!"
                                            }
                                        },
                                        value: `${slackUserId}++${this.profileName}++${selectedGroup}++${groupId}`
                                    }
                                ]
                            }
                        ]
                    }
                    await client.chat.postMessage(msgOption)
                    console.log(`User '${tgUser.email}' in profile '${this.profileName}', access request to group '${selectedGroup}' is send to group member ${approver.email} from '${this.approverGroup}'.`);
                } catch(e) {
                    console.log(e)
                }
            }

            // requester slack message
            msgOption = {
                channel: slackUserId,
                text: `Group access request to group _'${selectedGroup}'_ through profile _'${this.profileName}'_ has been sent. A new Slack message will be sent to you once the request is approved.`,
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `Group access request to group _'${selectedGroup}'_ through profile _'${this.profileName}'_ has been sent. A new Slack message will be sent to you once the request is approved.`
                        }
                    }
                ]
            }
            await client.chat.postMessage(msgOption)
        }
    };


    // called when an approver approves a request
    async approveAccessRequest({client, body, logger, ack}) {
        await ack();

    }

    // called when an approver rejects a request
    async rejectAccessRequest({client, body, logger, ack}) {
        await ack();

    }

}