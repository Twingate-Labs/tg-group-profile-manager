import boltPkg from '@slack/bolt';
import {createHome} from "./appHome.mjs";
import {openModal, submitChange} from "./appModal.mjs";
import dotenvPkg from 'dotenv';
const {App} = boltPkg;
dotenvPkg.config();
const policyConfig = JSON.parse(process.env.POLICY_CONFIG);

export const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET
});

// Listen for users opening your App Home
app.event('app_home_opened', async ({ event, client, logger }) => {
    try {
        const slackUserInfo = await client.users.info({user: event.user});
        const homeView = await createHome(policyConfig, slackUserInfo.user.profile.email);

        const result = await client.views.publish({
            // Use the user ID associated with the event
            user_id: event.user,
            "view": homeView
        });
        logger.info(`${event.user} opened app home.`)
    }
    catch (error) {
        logger.error(error);
    }
});


app.action('select_policy', async ({ body, context, ack }) => {
    ack();
    const view = await openModal(policyConfig, body.actions[0].value);
    try {
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
app.action('change_active_groups_multiselect', async ({ body, context, ack }) => {
    ack();
});

app.view('submit_active_group_change', async ({ body, client, logger,context, ack }) => {
    const selectedOptions = Object.values(Object.values(body.view.state.values)[0])[0].selected_options
    if (selectedOptions.length === 0){
        // todo: the error message is not return to Slack user
        await ack({
            response_action: 'errors',
            errors: {
                Groups: "Missing Selection",
            },
        })
    } else {
        ack();
        const [policyName, , userEmail] = selectedOptions[0].value.split("++")
        const selectedGroups = selectedOptions.map(option => option.value.split("++")[1])
        await submitChange(policyConfig, userEmail, policyName, selectedGroups);
        try {
            const homeView = await createHome(policyConfig, userEmail);
            const result = await client.views.publish({
                // Use the user ID associated with the event
                user_id: body.user.id,
                "view": homeView
            });
        }
        catch (error) {
            logger.error(error);
        }

    }

});


(async () => {
    const port = 8080
    // Start your app
    await app.start(process.env.PORT || port);
    console.log(`⚡️ Slack Bolt app is running on port ${port}!`);
})();
