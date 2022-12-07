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
        app.action(`approve_request-${index}`, this.processAccessRequest.bind(this));

        // called when an approver rejects a request
        app.action(`reject_request-${index}`, this.processAccessRequest.bind(this));

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
            return
        }

        // the user is not part of the approver group
        const approverGroup = await profileManager.lookUpGroupUsersByName(this.approverGroup)
        let msgOption = {}
        let approverResponses = []
        let approverMessages = []
        for (const approver of approverGroup.users) {
            const approverSlackInfo = await client.users.lookupByEmail({email: approver.email})

            const request = {
                approverEmail: approver.email,
                requesterTwingateId: tgUser.id,
                requesterEmail: tgUser.email,
                requesterSlackId: slackUserId,
                requestedGroupName: selectedGroup,
                requestedGroupId: groupId
            }


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
                    }
                ]
            }
            const response = await client.chat.postMessage(msgOption)

            // setting up the msgOption for adding button to the message
            msgOption.ts = response.ts
            msgOption.channel = response.channel
            msgOption.blocks.push(
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
                                    "text": `Are you sure you want to APPROVE the request to add user <@${slackUserId}> to the Twingate group '${selectedGroup}'?`
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
                            value: request
                        },
                        {
                            action_id: `reject_request-${this.profileIndex}`,
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
                                    "text": `Are you sure you want to REJECT the request to add user <@${slackUserId}> to the Twingate group '${selectedGroup}'?`
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
                            value: request
                        }
                    ]
                }
            )
            approverResponses.push ([response.channel, response.ts])
            approverMessages.push(msgOption)
        }

        // button value has 2000 char limit. without the approverResponse 300 chars, each approver adds around 40 chars
        if (approverResponses.length > 40) {
            approverResponses = approverResponses.slice(0, 41)
            approverMessages = approverMessages.slice(0, 41)
        }

        // update the message with button which include all the approver message channel and ts
        for (const message of approverMessages){
            const approverEmail = message.blocks[1].elements[0].value.approverEmail
            message.blocks[1].elements.forEach(element => element.value.approverMessages = approverResponses)
            // 40 test
            // message.blocks[1].elements.forEach(element => element.value.approverMessages = [["D0487E9ASPQ","1670342935.338389"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"]])
            // 80 test
            // message.blocks[1].elements.forEach(element => element.value.approverMessages = [["D0487E9ASPQ","1670342935.338389"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D0487E9ASPQ","1670342935.338389"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"],["D048E2M1ZQA","1670342935.681669"]])
            message.blocks[1].elements.forEach(element => element.value = JSON.stringify(element.value))
            await client.chat.update(message)
            console.log(`User '${tgUser.email}' in profile '${this.profileName}', access request to group '${selectedGroup}' is sent to group member ${approverEmail} from approver group '${this.approverGroup}'.`);
        }

        // requester slack message
        msgOption = {
            channel: slackUserId,
            text: `Group access request to group _'${selectedGroup}'_ through profile _'${this.profileName}'_ has been sent. A new Slack message will be sent to you once the request is approved/rejected.`,
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
    };


    // called when an approver approves or rejects a request
    async processAccessRequest({client, body, logger, ack}) {
        await ack();

        const request = JSON.parse(body.actions[0].value)
        const profileManager = new SlackProfileManager()

        // Make sure approver in the approver group of the profile
        const approver = await profileManager.lookupUserGroupByEmail(request.approverEmail);
        const approverGroupNames = approver.groups.map(group => group.name)
        if (!approverGroupNames.includes(this.approverGroup)) {
            logger.error(new Error(`Approver '${request.approverEmail}' is not in the approver group '${this.approverGroup}' of profile '${this.profileName}'`));
            return;
        }

        // Make sure requester has profile access
        const requester = await profileManager.lookupUserGroupByEmail(request.requesterEmail);
        const requesterGroupNames = requester.groups.map(group => group.name)
        if (!requesterGroupNames.includes(this.applicableToGroup)) {
            logger.error(new Error(`User '${request.requesterEmail}' has no access to profile '${this.profileName}'`));
            return;
        }



        let messageString = ""
        let msgOption = {}
        const approvers = request.approverMessages

        // request rejected
        if (body.actions[0].action_id.startsWith("reject_request")) {
            // sending all approvers the rejected message
            for (const approver of approvers) {
                try {
                    messageString = `Access request to group _'${request.requestedGroupName}'_ through profile _'${this.profileName}'_ is now rejected by <@${body.user.id}>.`
                    msgOption = {
                        channel: approver[0],
                        ts: approver[1],
                        text: `Approval is requested by <@${request.requesterSlackId}>`,
                        blocks: [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `<@${request.requesterSlackId}> is requesting access to group _'${request.requestedGroupName}'_ through profile _'${this.profileName}'_.\n\n\`Rejected By\` <@${body.user.id}>`
                                }
                            }
                        ]
                    }
                    await client.chat.update(msgOption)
                } catch(e) {
                    console.log(e)
                }
            }
            logger.info(`User '${request.requesterEmail}' request to group _'${request.requestedGroupName}'_ through profile _'${this.profileName}'_ has been rejected by ${body.user.id}.`)

            // sending rejected message to requester
            messageString = `Access request to group _'${request.requestedGroupName}'_ through profile _'${this.profileName}'_ has been rejected by <@${body.user.id}>.`
            msgOption = {
                channel: request.requesterSlackId,
                text: messageString,
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: messageString
                        }
                    },
                    {
                        type: 'actions',
                        elements: [
                            {
                                action_id: 'dummy',
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: 'Rejected',
                                    emoji: true
                                },
                                style: 'danger',
                                value: `dummy`
                            }
                        ]
                    }
                ]
            }
            await client.chat.postMessage(msgOption)
        }

        // request approved
        else {
            // send the twingate api request
            await profileManager.addUserToGroup(request.requestedGroupId, request.requesterTwingateId)

            // sending all approvers the approved message
            for (const approver of approvers) {
                try {
                    messageString = `Access request to group _'${request.requestedGroupName}'_ through profile _'${this.profileName}'_ is now approved by <@${body.user.id}>.`
                    msgOption = {
                        channel: approver[0],
                        ts: approver[1],
                        text: `Approval is requested by <@${request.requesterSlackId}>`,
                        blocks: [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `<@${request.requesterSlackId}> is requesting access to group _'${request.requestedGroupName}'_ through profile _'${this.profileName}'_.\n\n\`Approved By\` <@${body.user.id}>`
                                }
                            }
                        ]
                    }
                    await client.chat.update(msgOption)
                } catch(e) {
                    console.log(e)
                }
            }
            logger.info(`User '${request.requesterEmail}' request to group _'${request.requestedGroupName}'_ through profile _'${this.profileName}'_ has been approved by ${body.user.id}.`)


            // sending group change message to requester
            messageString = `Access request to group _'${request.requestedGroupName}'_ through profile _'${this.profileName}'_ has been approved by <@${body.user.id}>. \n\n _Note: Group changes will be passed to any connected clients automatically without the need to disconnect and reconnect and this process can take ~20 seconds to pass through to connected clients._`
            msgOption = {
                channel: request.requesterSlackId,
                text: messageString,
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: messageString
                        }
                    },
                    {
                        type: 'actions',
                        elements: [
                            {
                                action_id: 'dummy',
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: 'Approved',
                                    emoji: true
                                },
                                style: 'primary',
                                value: `dummy`
                            }
                        ]
                    }
                ]
            }
            await client.chat.postMessage(msgOption)
        }
    }

}