import {SlackProfileManager} from "./SlackProfileManager.mjs"

export const createHome = async(profileConfig, userEmail) => {
    if(profileConfig.profiles){
        // Note: iterate profiles might be better solution here as it can flag the groups with the same name.
        // Note: though the method used below is using less API calls
        const profileManager = new SlackProfileManager()
        await profileManager.init()
        const userWithGroups = await profileManager.lookupUserGroupByEmail(userEmail);
        const userId = userWithGroups.id
        const userGroups = userWithGroups.groups.edges.map(group => group.node)
        const permittedProfiles = profileConfig.profiles.filter(profile => userGroups.map(group=>group.name).includes(profile.applicableToGroup))

        let view = {
                "type": "home",
                "blocks": [{
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "*Welcome!* \nThis is home for Twingate Group Profile Manager."
                    }
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            // todo: confirm the url is working
                            text: "<https://github.com/Twingate-Labs/tg-profile-management-tool|GitHub> and <https://github.com/Twingate-Labs/tg-profile-management-tool/blob/main/README.md|User Guide>"
                        }
                    ]
                }
                ]
        }

        const splitter = {type: "divider"}

        for (const permittedProfile of permittedProfiles){
            const currentActiveGroups = permittedProfile.groups.filter(group => userGroups.map(userGroup => userGroup.name).includes(group))
            let currentActiveGroupsString = currentActiveGroups.join(", ")
            if (!currentActiveGroupsString) {
                currentActiveGroupsString = "None"
            }
            const block = {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `*Profile: ${permittedProfile.profileName}*\nCurrent Group: ${currentActiveGroupsString}`
                },
                "accessory": {
                    "type": "button",
                    "action_id": "select_profile",
                    "text": {
                        "type": "plain_text",
                        "emoji": true,
                        "text": "Change"
                    },
                    "value": `${permittedProfile.profileName}++${userEmail}`
                }
            }
            view.blocks.push(splitter)
            view.blocks.push(block)
        }
        return view
    }
};