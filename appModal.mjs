import {SlackPolicyManager} from "./SlackPolicyManager.mjs";

export const openModal = async (policies, requestValue) => {
    const [actionValue, userEmail] = requestValue.split("++")
    const policy = policies.filter(policy => policy.policyName == actionValue)[0]

    let modal = {
        type: 'modal',
        callback_id: 'submit_active_group_change',
        title: {
            type: 'plain_text',
            // Not making Policy Name Part of the title as the title has a maximum of 25 chars restriction
            text: `Change Your Group`
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
                    text: `Which group would you like to switch to?`
                },
                accessory: {
                    type: "static_select",
                    action_id: "change_group",
                    options: [{
                        "text": {
                            "type": "plain_text",
                            "text": "No Group",
                        },
                        "value": `${policy.policyName}++no_group++${userEmail}`
                    }],
                    initial_option: {
                        "text": {
                            "type": "plain_text",
                            "text": "No Group",
                        },
                        "value": `${policy.policyName}++no_group++${userEmail}`
                    }
                }
            }
        ]
    }

    for (const group of policy.groups) {
        const option = {
            text: {
                type: "plain_text",
                text: group
            },
            value: `${policy.policyName}++${group}++${userEmail}`
        }

        modal.blocks[0]["accessory"]["options"].push(option)
    }


    return modal;
};


export const submitChange = async (policies, userEmail, policyName, selectedGroup) => {
    const policy = policies.filter(policy => policy.policyName == policyName)[0]
    const policyManager = new SlackPolicyManager()
    await policyManager.init()
    const tgUserId = await policyManager.lookupUserByEmail(userEmail)
    let response = ""

    switch (selectedGroup) {
        case "no_group":
            for (const group of policy.groups) {
                const tgGroupId = await policyManager.lookupGroupByName(group)
                response = await policyManager.removeUserFromGroup(tgGroupId, tgUserId);
            }
            break;
        default:
            for (const group of policy.groups) {
                const tgGroupId = await policyManager.lookupGroupByName(group)
                if (selectedGroup !== group) {
                    response = await policyManager.removeUserFromGroup(tgGroupId, tgUserId);
                } else {
                    response = await policyManager.addUserToGroup(tgGroupId, tgUserId);
                }
            }
    }
};