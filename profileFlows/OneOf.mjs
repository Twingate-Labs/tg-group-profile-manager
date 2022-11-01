import {SlackProfileManager} from "../SlackProfileManager.mjs";
import {createHome} from "../appHome.mjs";


const GroupNameToIdMap = {};


export class OneOfProfile {
    constructor(app, profileConfig, index) {
        Object.assign(this, profileConfig.profiles[index]);
        this.profileIndex = index;
        this.profileConfig = profileConfig;
        this.app = app;
        // Called when user selects a oneOf profile
        app.action(`select_profile-${index}`, this.selectProfile.bind(this));

        // called when a user submits a oneOf profile change
        app.view(`submit_profile-${index}`, this.submitProfileChange.bind(this));
    }

    async getAppHomeBlock(tgUser) {
        const currentActiveGroups = this.groups.filter(group => tgUser.groups.map(userGroup => userGroup.name).includes(group))
        let currentActiveGroupsString = currentActiveGroups.join(", ")
        if (!currentActiveGroupsString) currentActiveGroupsString = "None"

        const block = {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `*Profile: ${this.profileName}*\nCurrent Group: ${currentActiveGroupsString}`
            },
            "accessory": {
                "type": "button",
                "action_id": `select_profile-${this.profileIndex}`,
                "text": {
                    "type": "plain_text",
                    "emoji": true,
                    "text": "Change"
                },
                "value": `${this.profileName}`
            }
        }
        return block;
    }
    async selectProfile({body, client, context, ack}) {
        await ack();
        try {
            const slackUserInfo = await client.users.info({user: body.user.id});
            const userEmail = slackUserInfo.user.profile.email;

            const profileManager = new SlackProfileManager()
            const tgUser = await profileManager.lookupUserGroupByEmail(userEmail);
            const userGroupNames = tgUser.groups.map(group => group.name)

            // Make sure user is allowed to access profile
            if (!userGroupNames.includes(this.applicableToGroup)) {
                throw new Error(`User '${userEmail}' has no access to profile '${this.profileName}'`);
            }

            const view = await this.openModal(userEmail, tgUser);
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
    async openModal(userEmail, tgUser) {


        let modal = {
            type: 'modal',
            callback_id: `submit_profile-${this.profileIndex}`,
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
                            value: JSON.stringify(["no_group"])
                        }],
                        initial_option: {
                            "text": {
                                "type": "plain_text",
                                "text": "No Group",
                            },
                            value: JSON.stringify(["no_group"])
                        }
                    }
                }
            ]
        }
        const userGroupNames = tgUser.groups.map(group => group.name)

        for (const group of this.groups) {
            const requisiteGroup = this.profileConfig.groupPermissions[group];
            // If switching to this group requires that user is already in another group then skip if they're not allowed this group
            if (typeof requisiteGroup === "string" && !userGroupNames.includes(requisiteGroup)) continue;

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

    // Called when user clicks to submit a profile change
    async submitProfileChange({body, client, logger, context, ack}) {
        await ack();
        const selectedOption = Object.values(Object.values(body.view.state.values)[0])[0].selected_option;
        const [selectedGroup] = JSON.parse(selectedOption.value)
        try {
            // TODO: can refactor this security checking into a reusable function
            const slackUserInfo = await client.users.info({user: body.user.id});
            const userEmail = slackUserInfo.user.profile.email;

            const profileManager = new SlackProfileManager()
            const tgUser = await profileManager.lookupUserGroupByEmail(userEmail);
            const userGroupNames = tgUser.groups.map(group => group.name)

            // Make sure user is allowed to access profile
            if (!userGroupNames.includes(this.applicableToGroup)) {
                throw new Error(`User '${userEmail}' has no access to profile '${this.profileName}'`);
            }

            // Make sure user is allowed to access selected group
            if (!this.groups.includes(selectedGroup) && selectedGroup !== "no_group") {
                throw new Error(`User '${userEmail}' not allowed to access requested group '${selectedGroup}' in profile '${this.profileName}'`);
            }

            if (typeof this.profileConfig.groupPermissions[selectedGroup] === "string") {
                // Switching to this group requires that user is already in another group, exit if they don't have permission
                if (!userGroupNames.includes(this.profileConfig.groupPermissions[selectedGroup])) {
                    throw new Error(`User '${userEmail}' has no access to group '${selectedGroup}' in profile '${this.profileName}' because they are not a member of required group '${this.profileConfig.groupPermissions[selectedGroup]}'`)
                }
            }

            await this.submitChange(userEmail, selectedGroup, tgUser);

            await this.app.refreshHome(body.user.id, userEmail);

            logger.info(`User '${userEmail}' changed profile '${this.profileName}' to group '${selectedGroup}'`)
        } catch (error) {
            logger.error(error);
        }

    }

    // Apply oneOf profile change
    async submitChange(userEmail, selectedGroup, tgUser) {
        const profileManager = new SlackProfileManager()
        const userId = tgUser.id
        for (const group of tgUser.groups) {
            GroupNameToIdMap[group.name] = group.id
        }

        let response = ""
        const userGroupNames = tgUser.groups.map(userGroup => userGroup.name)
        switch (selectedGroup) {
            case "no_group":
                for (const group of this.groups) {
                    if (userGroupNames.includes(group)) {
                        const groupId = GroupNameToIdMap[group] || await profileManager.lookupGroupByName(group)
                        if ( groupId == null ) throw new Error(`Group not found in Twingate: '${group}'`);
                        GroupNameToIdMap[group] = groupId
                        response = await profileManager.removeUserFromGroup(groupId, userId);
                        console.log(`User '${userEmail}' in profile '${this.profileName}' group '${group}', removing user from group.`)
                    } else {
                        console.log(`User '${userEmail}' not in profile '${this.profileName}' group '${group}', skipping removal.`)
                    }
                }
                break;
            default:
                const groupToAdd = selectedGroup
                const groupToRemove = this.groups.filter(group => group !== selectedGroup)

                // remove user from groups
                for (const group of groupToRemove) {
                    // Can wrap this up to avoid the duplicated code
                    if (userGroupNames.includes(group)) {
                        const groupId = GroupNameToIdMap[group] || await profileManager.lookupGroupByName(group);
                        if ( groupId == null ) throw new Error(`Group not found in Twingate: '${group}'`);
                        GroupNameToIdMap[group] = groupId
                        response = await profileManager.removeUserFromGroup(groupId, userId);
                        console.log(`User '${userEmail}' in profile '${this.profileName}' group '${group}', removing user from group.`)
                    } else {
                        console.log(`User '${userEmail}' not in profile '${this.profileName}' group '${group}', skipping removal.`)
                    }
                }

                // add user to group
                if (userGroupNames.includes(groupToAdd)) {
                    console.log(`User '${userEmail}' in profile '${this.profileName}' group '${groupToAdd}', skipping adding.`)
                } else {
                    const groupId = GroupNameToIdMap[groupToAdd] || await profileManager.lookupGroupByName(groupToAdd)
                    if ( groupId == null ) throw new Error(`Group not found in Twingate: '${groupToAdd}'`);
                    GroupNameToIdMap[groupToAdd] = groupId
                    response = await profileManager.addUserToGroup(groupId, userId);
                    console.log(`User '${userEmail}' not in profile '${this.profileName}' group '${groupToAdd}', adding user to group.`)
                }

        }
    };
}
