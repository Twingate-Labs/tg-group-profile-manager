import boltPkg from '@slack/bolt';
import {createHome} from "./appHome.mjs";
import {openModal, submitChange} from "./appModal.mjs";
import dotenvPkg from 'dotenv';
import {accessSecretVersion} from "./utils.mjs";
const {App} = boltPkg;
dotenvPkg.config();

async function initApp(app) {
    // fetching secrete from google cloud
    //todo: centralise all accessSecretVersion
    let profileConfig = ""
    if (process.env.DEPLOY_ENV !== "docker") {
        profileConfig = JSON.parse(await accessSecretVersion('tg-group-profile-manager-profile-config'));
    } else {
        profileConfig = JSON.parse(process.env.PROFILE_CONFIG);

    }

    // Listen for users opening your App Home
    app.event('app_home_opened', async ({ event, client, logger }) => {
        try {
            const slackUserInfo = await client.users.info({user: event.user});
            const homeView = await createHome(profileConfig, slackUserInfo.user.profile.email);
            const result = await client.views.publish({
                user_id: event.user,
                "view": homeView
            });
            logger.info(`${event.user} opened app home.`)
        }
        catch (error) {
            logger.error(error);
        }
    });


    app.action('select_profile', async ({ body, context, ack }) => {
        ack();
        try {
            const view = await openModal(profileConfig, body.actions[0].value);
            const result = await app.client.views.open({
                token: context.botToken,
                trigger_id: body.trigger_id,
                view: view
            })
        } catch(e) {
            console.log(e)
            app.error(e)
        }
    });

// dummy action watcher for multi static select
    app.action('change_group', async ({ body, context, ack }) => {
        ack();
    });

    app.view('submit_active_group_change', async ({ body, client, logger,context, ack }) => {
        ack();
        const selectedOption = Object.values(Object.values(body.view.state.values)[0])[0].selected_option;
        const [profileName, selectedGroup, userEmail] = selectedOption.value.split("++");
        try {
            await submitChange(profileConfig, userEmail, profileName, selectedGroup);
            const homeView = await createHome(profileConfig, userEmail);
            const result = await client.views.publish({
                user_id: body.user.id,
                "view": homeView
            });
            logger.info(`User '${userEmail}' changed profile '${profileName}' to group '${selectedGroup}'`)
        }
        catch (error) {
            logger.error(error);
        }

    });
}


(async () => {
    const port = 8080
    let [slackToken, slackSigningSecrete] = [
        process.env.SLACK_BOT_TOKEN,
        process.env.SLACK_SIGNING_SECRET
    ]
    // fetching secrete from google cloud
    //todo: centralise all accessSecretVersion
    if (process.env.DEPLOY_ENV !== "docker") {
        [slackToken, slackSigningSecrete] = [
            await accessSecretVersion('tg-group-profile-manager-bot-token'),
            await accessSecretVersion('tg-group-profile-manager-client-signing-secret')
        ]
    }



    const app = new App({
        token: slackToken,
        signingSecret: slackSigningSecrete
    });
    await initApp(app);
    await app.start(process.env.PORT || port);
    console.log(`⚡️ Slack Bolt app is running on port ${port}!`);
})();