

export class BaseProfile {
    constructor(app, profileConfig, index) {
        this.profileName = "";
        this.applicableToGroup = "Everyone";
        this.title = profileConfig.title || "";
        Object.assign(this, profileConfig.profiles[index]);
        this.profileIndex = index;
        this.profileConfig = profileConfig;
        this.app = app;
        this.openModalBlock = {
            type: 'modal',
            callback_id: `submit_profile-${this.profileIndex}`,
            title: {
                type: 'plain_text',
                // Not making Profile Name Part of the title as the title has a maximum of 25 chars restriction
                text: this.title
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
                        options: []
                    }
                }
            ]
        }
    }

    async getAppHomeBlock(tgUser) {
        return null;
    }

    // Called when a user opens a profile - get configuration for profile and shot it in a modal
    async openModal(tgUser) {
        return JSON.parse(JSON.stringify(this.openModalBlock));
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
}