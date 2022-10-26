import {SlackProfileManager} from "./SlackProfileManager.mjs";

export const openModal = async (profileConfig, requestValue) => {
    const [actionValue, userEmail] = requestValue.split("++")
    const profile = profileConfig.profiles.filter(profile => profile.profileName == actionValue)[0]

    let modal = {
        type: 'modal',
        callback_id: 'submit_active_group_change',
        title: {
            type: 'plain_text',
            // Not making Profile Name Part of the title as the title has a maximum of 25 chars restriction
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
                        "value": `${profile.profileName}++no_group++${userEmail}`
                    }],
                    initial_option: {
                        "text": {
                            "type": "plain_text",
                            "text": "No Group",
                        },
                        "value": `${profile.profileName}++no_group++${userEmail}`
                    }
                }
            }
        ]
    }

    for (const group of profile.groups) {
        const option = {
            text: {
                type: "plain_text",
                text: group
            },
            value: `${profile.profileName}++${group}++${userEmail}`
        }

        modal.blocks[0]["accessory"]["options"].push(option)
    }


    return modal;
};

const GroupNameToIdMap = {};

export const submitChange = async (profileConfig, userEmail, profileName, selectedGroup) => {
    const profile = profileConfig.profiles.filter(profile => profile.profileName == profileName)[0]
    const profileManager = new SlackProfileManager()
    await profileManager.init()
    const userWithGroups = await profileManager.lookupUserGroupByEmail(userEmail);
    const userId = userWithGroups.id
    const userGroups = userWithGroups.groups.edges.map(group => group.node)
    for (const group of userGroups){
        GroupNameToIdMap[group.name] = group.id
    }


    let response = ""
    const userGroupNames = userGroups.map(userGroup => userGroup.name)
    switch (selectedGroup) {
        case "no_group":
            for (const group of profile.groups) {
                const groupId = GroupNameToIdMap[group] || await profileManager.lookupGroupByName(group)
                GroupNameToIdMap[group] = groupId
                if (userGroupNames.includes(group)) {
                    response = await profileManager.removeUserFromGroup(groupId, userId);
                    console.log(`User '${userEmail}' in profile '${profile.profileName}' group '${group}', removing user from group.`)
                } else {
                    console.log(`User '${userEmail}' not in profile '${profile.profileName}' group '${group}', skipping removal.`)
                }
            }
            break;
        default:
            const groupToAdd = selectedGroup
            const groupToRemove = profile.groups.filter(group => group!== selectedGroup)

            // remove user from groups
            for (const group of groupToRemove){

                if (userGroupNames.includes(group)) {
                    const groupId = GroupNameToIdMap[group] || await profileManager.lookupGroupByName(group)
                    GroupNameToIdMap[group] = groupId
                    response = await profileManager.removeUserFromGroup(groupId, userId);
                    console.log(`User '${userEmail}' in profile '${profile.profileName}' group '${group}', removing user from group.`)
                } else {
                    console.log(`User '${userEmail}' not in profile '${profile.profileName}' group '${group}', skipping removal.`)
                }
            }

            // add user to group
            if (userGroupNames.includes(groupToAdd)) {
                console.log(`User '${userEmail}' in profile '${profile.profileName}' group '${groupToAdd}', skipping adding.`)
            } else {
                const groupId = GroupNameToIdMap[groupToAdd] || await profileManager.lookupGroupByName(groupToAdd)
                GroupNameToIdMap[groupToAdd] = groupId
                response = await profileManager.addUserToGroup(groupId, userId);
                console.log(`User '${userEmail}' not in profile '${profile.profileName}' group '${groupToAdd}', adding user to group.`)
            }

    }
};