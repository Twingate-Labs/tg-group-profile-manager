import {SlackPolicyManager} from "./SlackPolicyManager.mjs";

export const openModal = async (policies, requestValue) => {
    const [actionValue, userEmail] = requestValue.split("++")

    const policy = policies.filter(policy => policy.policyName == actionValue)[0]
    const policyManager = new SlackPolicyManager()
    const allGroups = await policyManager.fetchAllGroups({})
    const userGroups = (await policyManager.lookupUserGroupByEmail(userEmail)).groups.edges.map(group => group.node)
    const userPolicyActiveGroups = userGroups.map(group => group.name).filter(group => policy.groups.includes(group))

    let modal = {
        type: 'modal',
        callback_id: 'submit_active_group_change',
        title: {
            type: 'plain_text',
            text: 'Make A Change'
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
                    text: `What would you like to change policy *${actionValue}* active group to?`
                },
                accessory: {
                    type: "multi_static_select",
                    action_id: "change_active_groups_multiselect",
                    options: [],
                    initial_options: []
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
        if (userPolicyActiveGroups.includes(group)) {
            modal.blocks[0]["accessory"]["initial_options"].push(option)
        }
    }

    if (modal.blocks[0]["accessory"]["initial_options"].length === 0) {
        delete modal.blocks[0]["accessory"]["initial_options"]
    }

    return modal;
};


export const submitChange = async (policies, userEmail, policyName, selectedGroups) => {
    const policy = policies.filter(policy => policy.policyName == policyName)[0]

    const policyManager = new SlackPolicyManager()
    const tgUserId = await policyManager.lookupUserByEmail(userEmail)
    let response = ""

    for (const group of policy.groups) {
        const tgGroupId = await policyManager.lookupGroupByName(group)
        if (!selectedGroups.includes(group)){
            response = await policyManager.removeUserFromGroup(tgGroupId, tgUserId);
        } else {
            response = await policyManager.addUserToGroup(tgGroupId, tgUserId);
        }
    }
};