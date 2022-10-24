import {SlackPolicyManager} from "./SlackPolicyManager.mjs"

export const createHome = async(policies, userEmail) => {
    if(policies){
        // Note: iterate policies might be better solution here as it can flag the groups with the same name.
        // Note: though the method used below is using less API calls
        const policyManager = new SlackPolicyManager()
        await policyManager.init()
        const userGroups = (await policyManager.lookupUserGroupByEmail(userEmail)).groups.edges.map(group => group.node)
        const permittedPolicies = policies.filter(policy => userGroups.map(group=>group.name).includes(policy.applicableToGroup))

        let view = {
                "type": "home",
                "blocks": [{
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "*Welcome!* \nThis is home for Twingate Group Policy Manager."
                    }
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            // todo: confirm the url is working
                            text: "<https://github.com/Twingate-Labs/tg-policy-management-tool|GitHub> and <https://github.com/Twingate-Labs/tg-policy-management-tool/blob/main/README.md|User Guide>"
                        }
                    ]
                }
                ]
        }

        const splitter = {type: "divider"}

        for (const permittedPolicy of permittedPolicies){
            const currentActiveGroups = permittedPolicy.groups.filter(group => userGroups.map(userGroup => userGroup.name).includes(group))
            let currentActiveGroupsString = currentActiveGroups.join(", ")
            if (!currentActiveGroupsString) {
                currentActiveGroupsString = "None"
            }
            const block = {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `*Policy: ${permittedPolicy.policyName}*\nCurrent Group: ${currentActiveGroupsString}`
                },
                "accessory": {
                    "type": "button",
                    "action_id": "select_policy",
                    "text": {
                        "type": "plain_text",
                        "emoji": true,
                        "text": "Change"
                    },
                    "value": `${permittedPolicy.policyName}++${userEmail}`
                }
            }
            view.blocks.push(splitter)
            view.blocks.push(block)
        }
        return view
    }
};