import {SlackProfileManager} from "./SlackProfileManager.mjs"

export const createHome = async(profileConfig, userEmail) => {
    if(profileConfig.profiles){
        // Note: iterate profiles might be better solution here as it can flag the groups with the same name.
        // Note: though the method used below is using less API calls
        const profileManager = new SlackProfileManager()
        await profileManager.init()
        const userWithGroups = await profileManager.lookupUserGroupByEmail(userEmail);
        const view = {
            "type": "home",
            "blocks": [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "*Welcome!* \nUsing this tool you can change your group profiles.\n*Please note all changes can typically take at least 20 seconds to propagate.*"
                    }
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: "<https://github.com/Twingate-Labs/tg-group-profile-manager|GitHub> and <https://github.com/Twingate-Labs/tg-group-profile-manager/blob/main/README.md|User Guide>"
                        }
                    ]
                }
            ]
        }
        if (!userWithGroups) {
            console.log(`Email '${userEmail}' not found in Twingate`)
            view.blocks.push({
                    type: "divider"
                },
                {
                    type: "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": `*ERROR*\n Email '${userEmail}' not found in Twingate, please ensure your Slack account email address is the same as your Twingate email address.`
                    }
                })
             return view
        }

        const userId = userWithGroups.id
        const userGroups = userWithGroups.groups.edges.map(group => group.node)
        const permittedProfiles = profileConfig.profiles.filter(profile => userGroups.map(group=>group.name).includes(profile.applicableToGroup))

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
            view.blocks.push({type: "divider"}, block)
        }
        return view
    }
};