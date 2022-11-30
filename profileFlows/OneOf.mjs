import {SlackProfileManager} from "../SlackProfileManager.mjs";
import {BaseProfile} from "./BaseProfile.mjs";

export class OneOfProfile extends BaseProfile {
    constructor(app, profileConfig, index) {
        super(app, profileConfig, index)
        this.groups = this.groups || [];
        // Called when user selects a oneOf profile
        app.action(`select_profile-${index}`, this.selectProfile.bind(this));

        // called when a user submits a oneOf profile change
        app.view(`submit_profile-${index}`, this.submitProfileChange.bind(this));
    }

    async getAppHomeBlock(tgUser) {
        const userGroupNames = tgUser.groups.map(group => group.name);
        const currentActiveGroups = this.groups.filter(group => userGroupNames.includes(group))
        let currentActiveGroupsString = currentActiveGroups.join(", ")
        if (!currentActiveGroupsString) {
            currentActiveGroupsString = "None"
        }

        return {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `*Profile: ${this.profileName}* (One-Of)\nCurrent Group: ${currentActiveGroupsString}`
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
    }

    async selectProfile({body, context, ack, logger}) {
        await ack();
        try {
            const tgUser = await this.app.lookupTgUserFromSlackUserId(body.user.id);
            const userGroupNames = tgUser.groups.map(group => group.name);

            // Make sure user is allowed to access profile
            if (!userGroupNames.includes(this.applicableToGroup)) {
                logger.error(new Error(`User '${tgUser.email}' has no access to profile '${this.profileName}'`));
                return;
            }

            const view = await this.openModal(tgUser);
            await this.app.client.views.open({
                token: context.botToken,
                trigger_id: body.trigger_id,
                view: view
            })
        } catch (e) {
            logger.error(e);
        }
    }

    // Called when a user opens a profile - get configuration for profile and shot it in a modal
    async openModal(tgUser) {

        const noGroupOption = {
            "text": {
                "type": "plain_text",
                "text": "No Group",
            },
            value: JSON.stringify([-1])
        };
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
                        options: [noGroupOption],
                        initial_option: noGroupOption
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
    async submitProfileChange({body, logger, ack}) {
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

            if (typeof this.profileConfig.groupPermissions[selectedGroup] === "string") {
                // Switching to this group requires that user is already in another group, exit if they don't have permission
                if (!userGroupNames.includes(this.profileConfig.groupPermissions[selectedGroup])) {
                    logger.error(new Error(`User '${tgUser.email}' has no access to group '${selectedGroup}' in profile '${this.profileName}' because they are not a member of required group '${this.profileConfig.groupPermissions[selectedGroup]}'`));
                    return;
                }
            }

            await this.submitChange(selectedGroup, tgUser);

            await this.app.refreshHome(body.user.id, tgUser.email);

            logger.info(`User '${tgUser.email}' changed profile '${this.profileName}' to group '${selectedGroup}'`)
        } catch (error) {
            logger.error(error);
        }

    }

    // Apply oneOf profile change
    async submitChange(selectedGroup, tgUser) {
        const profileManager = new SlackProfileManager(),
            userGroupNames = tgUser.groups.map(userGroup => userGroup.name),
            groupNamesToRemove = this.groups.filter(group => group !== selectedGroup && userGroupNames.includes(group))
        ;

        if (groupNamesToRemove.length > 0) {
            console.log(`User '${tgUser.email}' in profile '${this.profileName}' with selected group '${selectedGroup}' - removing group(s): ${groupNamesToRemove.map(g=>`'${g}'`).join(", ")}.`);
            const groupsIdsToRemove = await Promise.all(groupNamesToRemove.map(groupName => profileManager.lookupGroupByName(groupName)));
            await Promise.all(groupsIdsToRemove.map(groupId => profileManager.removeUserFromGroup(groupId, tgUser.id)));
        } else {
            console.log(`User '${tgUser.email}' in profile '${this.profileName}' with selected group '${selectedGroup}' - no groups to remove.`);
        }

        if (typeof selectedGroup === "string" && !userGroupNames.includes(selectedGroup)) {
            console.log(`User '${tgUser.email}' in profile '${this.profileName}' - adding group: ${selectedGroup}.`);
            const groupId = await profileManager.lookupGroupByName(selectedGroup);
            await profileManager.addUserToGroup(groupId, tgUser.id)
        } else {
            console.log(`User '${tgUser.email}' in profile '${this.profileName}' with selected group '${selectedGroup}' - no group to add.`);
        }

    };
}
