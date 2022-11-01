import {SlackProfileManager} from "../SlackProfileManager.mjs";
import {createHome} from "../appHome.mjs";


const GroupNameToIdMap = {};


export class OneOfProfile {
    constructor(app, profileConfig) {
        this.profileType = "oneOf";
        this.profileConfig = profileConfig;
        this.app = app;
        // Called when user selects a oneOf profile
        app.action(`select_profile-${this.profileType}`, this.selectProfile.bind(this));

        // called when a user submits a oneOf profile change
        app.view(`submit_profile-${this.profileType}`, this.submitProfileChange.bind(this));
    }

    async selectProfile({body, client, context, ack}) {

        await ack();
        try {
            const slackUserInfo = await client.users.info({user: body.user.id});
            const userEmail = slackUserInfo.user.profile.email;
            const requestedProfileName = body.actions[0].value;
            const requestedProfile = this.profileConfig.profiles.find(profile => profile.profileName === requestedProfileName);
            // Make sure profile exists
            if (requestedProfile === undefined) {
                throw new Error(`Profile not found.`)
            }

            const profileManager = new SlackProfileManager()
            const tgUser = await profileManager.lookupUserGroupByEmail(userEmail);
            const userGroupNames = tgUser.groups.edges.map(group => group.node.name)

            // Make sure user is allowed to access profile
            if (!userGroupNames.includes(requestedProfile.applicableToGroup)) {
                throw new Error(`User '${userEmail}' has no access to profile '${requestedProfileName}'`);
            }

            const view = await this.openModal(requestedProfile, userEmail, tgUser);
            const result = await this.app.client.views.open({
                token: context.botToken,
                trigger_id: body.trigger_id,
                view: view
            })
        } catch (e) {
            console.log(e)
            this.app.error(e)
        }
    }

    // Called when a user opens a profile - get configuration for profile and shot it in a modal
    async openModal(profile, userEmail, tgUser) {


        let modal = {
            type: 'modal',
            callback_id: 'submit_profile-oneOf',
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
                            value: JSON.stringify([profile.profileName, "no_group"])
                        }],
                        initial_option: {
                            "text": {
                                "type": "plain_text",
                                "text": "No Group",
                            },
                            value: JSON.stringify([profile.profileName, "no_group"])
                        }
                    }
                }
            ]
        }
        const userGroupNames = tgUser.groups.edges.map(group => group.node.name)

        for (const group of profile.groups) {
            const requisiteGroup = this.profileConfig.groupPermissions[group];
            // If switching to this group requires that user is already in another group then skip if they're not allowed this group
            if (typeof requisiteGroup === "string" && !userGroupNames.includes(requisiteGroup)) {
                continue;
            }

            const option = {
                text: {
                    type: "plain_text",
                    text: group
                },
                value: JSON.stringify([profile.profileName, group])
            }

            modal.blocks[0]["accessory"]["options"].push(option)
        }


        return modal;
    }

    // Called when user clicks to submit a profile change
    async submitProfileChange({body, client, logger, context, ack}) {
        await ack();
        const selectedOption = Object.values(Object.values(body.view.state.values)[0])[0].selected_option;
        const [requestedProfileName, selectedGroup] = JSON.parse(selectedOption.value)
        try {
            // TODO: can refactor this security checking into a reusable function
            const slackUserInfo = await client.users.info({user: body.user.id});
            const userEmail = slackUserInfo.user.profile.email;
            const requestedProfile = this.profileConfig.profiles.find(profile => profile.profileName === requestedProfileName);
            // Make sure profile exists
            if (requestedProfile === undefined) {
                throw new Error(`Profile not found.`)
            }

            const profileManager = new SlackProfileManager()
            const tgUser = await profileManager.lookupUserGroupByEmail(userEmail);
            const userGroupNames = tgUser.groups.edges.map(group => group.node.name)

            // Make sure user is allowed to access profile
            if (!userGroupNames.includes(requestedProfile.applicableToGroup)) {
                throw new Error(`User '${userEmail}' has no access to profile '${requestedProfileName}'`);
            }

            // Make sure user is allowed to access selected group
            if (!requestedProfile.groups.includes(selectedGroup) && selectedGroup !== "no_group") {
                throw new Error(`User '${userEmail}' not allowed to access requested group '${selectedGroup}' in profile '${requestedProfileName}'`);
            }

            if (typeof this.profileConfig.groupPermissions[selectedGroup] === "string") {
                // Switching to this group requires that user is already in another group, exit if they don't have permission
                if (!userGroupNames.includes(this.profileConfig.groupPermissions[selectedGroup])) {
                    throw new Error(`User '${userEmail}' has no access to group '${selectedGroup}' in profile '${requestedProfileName}' because they are not a member of required group '${this.profileConfig.groupPermissions[selectedGroup]}'`)
                }
            }

            await this.submitChange(userEmail, requestedProfile, selectedGroup, tgUser);

            await this.app.refreshHome(body.user.id, userEmail);

            logger.info(`User '${userEmail}' changed profile '${requestedProfileName}' to group '${selectedGroup}'`)
        } catch (error) {
            logger.error(error);
        }

    }

    // Apply oneOf profile change
    async submitChange(userEmail, profile, selectedGroup, tgUser) {
        const profileManager = new SlackProfileManager()
        const userId = tgUser.id
        const userGroups = tgUser.groups.edges.map(group => group.node)
        for (const group of userGroups) {
            GroupNameToIdMap[group.name] = group.id
        }

        let response = ""
        const userGroupNames = userGroups.map(userGroup => userGroup.name)
        switch (selectedGroup) {
            case "no_group":
                for (const group of profile.groups) {
                    if (userGroupNames.includes(group)) {
                        const groupId = GroupNameToIdMap[group] || await profileManager.lookupGroupByName(group)
                        GroupNameToIdMap[group] = groupId
                        response = await profileManager.removeUserFromGroup(groupId, userId);
                        console.log(`User '${userEmail}' in profile '${profile.profileName}' group '${group}', removing user from group.`)
                    } else {
                        console.log(`User '${userEmail}' not in profile '${profile.profileName}' group '${group}', skipping removal.`)
                    }
                }
                break;
            default:
                const groupToAdd = selectedGroup
                const groupToRemove = profile.groups.filter(group => group !== selectedGroup)

                // remove user from groups
                for (const group of groupToRemove) {
                    // Can wrap this up to avoid the duplicated code
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
}
