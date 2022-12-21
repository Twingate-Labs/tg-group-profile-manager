import {BaseProfile} from "./BaseProfile.mjs";
import {SlackProfileManager} from "../SlackProfileManager.mjs";



export class SelfServeApproval extends BaseProfile {
    constructor(app, profileConfig, index) {
        const timeOptions = {
            "Forever" : "Forever",
            "1h": "1 Hour",
            "8h": "8 Hours",
            "24h": "24 Hours",
            "7d": "7 Days",
            "30d": "30 Days",
            "90d": "90 Days"
        }
        profileConfig.title = 'Request Access';
        super(app, profileConfig, index)
        this.openModalBlock.blocks[0].text.text = 'Which group would you like to request access to?';
        this.timeOptions = this.timeOptions || [];
        this.timeOptions = this.timeOptions.filter(option => Object.keys(timeOptions).includes(option)).map(option => timeOptions[option])
        this.groups = this.groups || [];
        // Called when user selects a selfServe profile
        app.action(`select_profile-${index}`, this.selectProfile.bind(this));

        // called when a user submits a selfServer request
        app.view(`submit_profile-${index}`, this.submitAccessRequest.bind(this));

        // called when an approver approves a request
        app.action(`approve_request-${index}`, this.processAccessRequest.bind(this));

        // called when an approver rejects a request
        app.action(`reject_request-${index}`, this.processAccessRequest.bind(this));

        app.message(/^#Scheduled Message Trigger#/, this.scheduledMessageTrigger.bind(this));

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
        // todo: add initial option
        for (const group of this.groups) {
            // skip if the user already in the group
            if (userGroupNames.includes(group)) continue
            const option = {
                text: {
                    type: "plain_text",
                    text: group
                },
                value: group
            }
            modal.blocks[0]["accessory"]["options"].push(option)
        }

        if (this.timeOptions.length > 0) {
            const timeOptionsBlock = {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `How long would you like to request access for?`
                },
                accessory: {
                    type: "static_select",
                    action_id: "change_time_option",
                    options: [],
                    initial_option: {
                        text: {
                            type: "plain_text",
                            text: this.timeOptions[0]
                        },
                        value: this.timeOptions[0]
                    }
                }
            }
            for (const timeOption of this.timeOptions){
                const option = {
                    text: {
                        type: "plain_text",
                        text: timeOption
                    },
                    value: timeOption
                }
                timeOptionsBlock.accessory.options.push(option)
            }
            modal.blocks.push(timeOptionsBlock)
        }



        // reason for request block
        modal.blocks.push({
            type: "input",
            element: {
                type: "plain_text_input",
                multiline: true,
                placeholder: {
                    type: "plain_text",
                    text: "Enter your reason for request."
                },
                max_length: 100
            },
            label: {
                type: "plain_text",
                text: "Reason For Request"
            },
        })
        return modal;
    }

    // Called when user clicks to submit access request
    async submitAccessRequest({client, body, logger, ack}) {
        await ack();
        let selectedOption = ""
        let selectedTime = "Forever"
        let reasonForRequest = ""

        if (body.view.blocks.length === 3) {
            selectedOption = Object.values(Object.values(body.view.state.values)[0])[0].selected_option.value;
            selectedTime = Object.values(Object.values(body.view.state.values)[1])[0].selected_option.value
            reasonForRequest = Object.values(Object.values(body.view.state.values)[2])[0].value;
        } else {
            selectedOption = Object.values(Object.values(body.view.state.values)[0])[0].selected_option.value;
            reasonForRequest = Object.values(Object.values(body.view.state.values)[1])[0].value;
        }

        try {
            const tgUser = await this.app.lookupTgUserFromSlackUserId(body.user.id);
            const userGroupNames = tgUser.groups.map(group => group.name)

            // Make sure user is allowed to access profile
            if (!userGroupNames.includes(this.applicableToGroup)) {
                logger.error(new Error(`User '${tgUser.email}' has no access to profile '${this.profileName}'`));
                return;
            }

            //todo: check the profile contains the time option

            // Make sure user is allowed to access selected group
            if (typeof selectedOption === "string" && !this.groups.includes(selectedOption)) {
                logger.error(new Error(`User '${tgUser.email}' not allowed to access requested group '${selectedOption}' in profile '${this.profileName}'`));
                return;
            }

            await this.submitRequest(body, client, selectedOption, selectedTime, reasonForRequest, tgUser, body.user.id);

            await this.app.refreshHome(body.user.id, tgUser.email);
        } catch (error) {
            logger.error(error);
        }

    }

    // Apply selfServe profile change
    async submitRequest(body, client, selectedGroup, selectedTime,reasonForRequest, tgUser, slackUserId) {
        const profileManager = new SlackProfileManager(),
            userGroupNames = tgUser.groups.map(userGroup => userGroup.name),
            groupId = await profileManager.lookupGroupByName(selectedGroup);

        // the user is part of the approver group
        if (userGroupNames.includes(this.approverGroup)){
            let msgOption = ""
            if (selectedTime !== "Forever") {
                // todo: adding expire time
                const expiry = this.durationParser(Math.round(Date.now()/1000), selectedTime)

                const request = {
                    approverSlackId: slackUserId,
                    requesterTwingateId: tgUser.id,
                    requesterEmail: tgUser.email,
                    requesterSlackId: slackUserId,
                    requestedGroupName: selectedGroup,
                    requestedGroupId: groupId,
                    reasonForRequest: reasonForRequest,
                    selectedTime: selectedTime,
                    expiry: expiry
                }

                const botInfo = await client.auth.test()
                // await client.chat.scheduleMessage({
                await client.chat.postMessage({
                    channel: botInfo.user_id,
                    // channel: "C045BRH55HA",
                    text: `#Scheduled Message Trigger#${JSON.stringify(request)}`,
                    post_at: expiry
                })
                console.log(`<@${request.requesterSlackId}> requesting access through profile _'${this.profileName}'_. Group: ${request.requestedGroupName} Duration: ${request.selectedTime} will be expired at '${expiry}'`)
            }

            await profileManager.addUserToGroup(groupId, tgUser.id)
            console.log(`User '${tgUser.email}' in profile '${this.profileName}' is part of the approver group '${this.approverGroup}', access request through profile ${this.profileName} to group '${selectedGroup}' with duration '${selectedTime}' approved.`);


            // sending self approved message to user
            let messageString = `The access request through profile _'${this.profileName}'_.\nGroup: ${selectedGroup}\n\`Your access will expire in ${selectedTime}\`\n\`Self Approved\`\n_Note: Group changes will be passed to any connected clients automatically without the need to disconnect and reconnect and this process can take ~20 seconds to pass through to connected clients._`
            msgOption = {
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
                requestedGroupId: groupId,
                reasonForRequest: reasonForRequest,
                selectedTime: selectedTime,
            }


            // approver slack message
            let messageString = `<@${slackUserId}> is requesting access through profile _'${this.profileName}'_.\nGroup: ${selectedGroup}\nDuration: ${selectedTime}\nReason For Request: ${reasonForRequest}.`
            msgOption = {
                channel: approverSlackInfo.user.id,
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
                                    "text": `Are you sure you want to APPROVE the request to add user <@${slackUserId}> to the Twingate group '${selectedGroup}' for _'${selectedTime}'?`
                                },
                                "confirm": {
                                    "type": "plain_text",
                                    "text": "Confirm"
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
                                    "text": `Are you sure you want to REJECT the request to add user <@${slackUserId}> to the Twingate group '${selectedGroup}' for _'${selectedTime}'?`
                                },
                                "confirm": {
                                    "type": "plain_text",
                                    "text": "Confirm"
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

        // button value has 2000 char limit. without the approverResponse 300 chars, each approver adds around 40 chars + reason for request 150
        if (approverResponses.length > 25) {
            approverResponses = approverResponses.slice(0, 26)
            approverMessages = approverMessages.slice(0, 26)
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
            console.log(`User '${tgUser.email}' in profile '${this.profileName}', access request to group '${selectedGroup}' with duration _'${selectedTime}'_ is sent to group member ${approverEmail} from approver group '${this.approverGroup}'.`);
        }

        // requester slack message
        let messageString = `Group access request through profile _'${this.profileName}' has been sent.\nGroup: ${selectedGroup}\nDuration: ${selectedTime}\nA new Slack message will be sent to you once the request is approved/rejected.`
        msgOption = {
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


        let msgOption = {}
        const reasonForRequest = request.reasonForRequest
        const approvers = request.approverMessages

        // request rejected
        if (body.actions[0].action_id.startsWith("reject_request")) {
            // sending all approvers the rejected message
            for (const approver of approvers) {
                try {
                    let messageString = `<@${request.requesterSlackId}> is requesting access through profile _'${this.profileName}'_.\nGroup: ${request.requestedGroupName}\nDuration: ${request.selectedTime}\nReason For Request: ${reasonForRequest}.\n\`Rejected By\` <@${body.user.id}>`
                    msgOption = {
                        channel: approver[0],
                        ts: approver[1],
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
                    await client.chat.update(msgOption)
                } catch(e) {
                    console.log(e)
                }
            }
            logger.info(`User '${request.requesterEmail}' request to group _'${request.requestedGroupName}'_ with duration _'${request.selectedTime}'_through profile _'${this.profileName}'_ has been rejected by ${body.user.id}.`)

            // sending rejected message to requester
            let messageString = `Access request through profile _'${this.profileName}'_.\nGroup: ${request.requestedGroupName}\nDuration: ${request.selectedTime}\n\`Rejected By\` <@${body.user.id}>`
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
                    }
                ]
            }
            await client.chat.postMessage(msgOption)
        }

        // request approved
        else {
            const botInfo = await client.auth.test()
            let expiry = "Forever"
            if (request.selectedTime !== "Forever") {
                request.approverSlackId = body.user.id
                expiry = this.durationParser(Math.round(body.message.ts), request.selectedTime)
                // await client.chat.scheduleMessage({
                await client.chat.postMessage({
                    channel: botInfo.user_id,
                    // channel: "C045BRH55HA",
                    text: `#Scheduled Message Trigger#${JSON.stringify(request)}`,
                    post_at: expiry
                })
                console.log(`<@${request.requesterSlackId}> requesting access through profile _'${this.profileName}'_. Group: ${request.requestedGroupName} Duration: ${request.selectedTime} will be expired at '${expiry}'`)
            }


            // send the twingate api request
            await profileManager.addUserToGroup(request.requestedGroupId, request.requesterTwingateId)

            // sending all approvers the approved message
            for (const approver of approvers) {
                try {
                    let messageString = `<@${request.requesterSlackId}> is requesting access through profile _'${this.profileName}'_.\nGroup: ${request.requestedGroupName}\nDuration: ${request.selectedTime}\nReason For Request: ${reasonForRequest}.\n\`Approved By\` <@${body.user.id}>`
                    msgOption = {
                        channel: approver[0],
                        ts: approver[1],
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
                    await client.chat.update(msgOption)
                } catch(e) {
                    console.log(e)
                }
            }
            logger.info(`User '${request.requesterEmail}' request to group _'${request.requestedGroupName}'_ with duration _'${request.selectedTime}'_through profile _'${this.profileName}'_ has been approved by ${body.user.id}.`)


            // sending group change message to requester
            let messageString = `Access request through profile _'${this.profileName}'_.\nGroup: ${request.requestedGroupName}\n\`Your access will expire in ${request.selectedTime}\`\n\`Approved By\` <@${body.user.id}> \n _Note: Group changes will be passed to any connected clients automatically without the need to disconnect and reconnect and this process can take ~20 seconds to pass through to connected clients._`
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
                    }
                ]
            }
            await client.chat.postMessage(msgOption)
        }
    }

    async scheduledMessageTrigger({event, client, body, context, ack, logger}) {
        const botInfo = await client.auth.test()

        // confirm the message was sent by the same bot user
        if (event.bot_id !== botInfo.bot_id) {
            console.warn(`Unexpected scheduled message received from user ${event.bot_id}`)
            return
        }

        const request = JSON.parse(event.text.replace("#Scheduled Message Trigger#", ""))

        // remove user from group through twingate API
        const profileManager = new SlackProfileManager()
        await profileManager.removeUserFromGroup(request.requestedGroupId, request.requesterTwingateId)

        // approver message
        let messageString = `<@${request.requesterSlackId}> profile _'${this.profileName}'_ access expired.\nGroup: ${request.requestedGroupName}\nDuration: ${request.selectedTime}\nReason For Request: ${request.reasonForRequest}.\nApproved By <@${request.approverSlackId}>\n\`Access Expired\``
        let msgOption = {
            channel: request.approverSlackId,
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

        if (request.approverSlackId === request.requesterSlackId) return

        // requester message
        messageString = `Profile _'${this.profileName}'_ access expired.\nGroup: ${request.requestedGroupName}\nDuration: ${request.selectedTime}\nApproved By <@${request.approverSlackId}>\n\`Access Expired\``
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
                }
            ]
        }
        await client.chat.postMessage(msgOption)

        console.log(`Profile _'${this.profileName}'_ access expired. Group: ${request.requestedGroupName} Duration: ${request.selectedTime}`)

    }

    durationParser (timeNow, selectedTime){
        switch (true) {
            case /\d+ Hour(s)?$/.test(selectedTime):
                const hours = selectedTime.split(" ")[0]
                return timeNow + (hours*60*60)
            case /\d+ Day(s)?$/.test(selectedTime):
                const days = selectedTime.split(" ")[0]
                return timeNow + (days*24*60*60)
            default:
                throw `time option '${selectedTime}' format not supported`
        }
    }

}