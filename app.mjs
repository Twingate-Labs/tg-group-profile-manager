import boltPkg from '@slack/bolt';
import {createHome} from "./appHome.mjs";
import {openModal, submitChange} from "./appModal.mjs";
import dotenvPkg from 'dotenv';
import {accessSecretVersion} from "./utils.mjs";
import {SlackProfileManager} from "./SlackProfileManager.mjs";
const {App} = boltPkg;
dotenvPkg.config();

async function initApp(app) {
    // fetching secret from google cloud
    //todo: centralise all accessSecretVersion
    let profileConfig = ""
    if (process.env.DEPLOY_ENV !== "docker") {
        profileConfig = JSON.parse(await accessSecretVersion('tg-group-profile-manager-profile-config'));
    } else {
        profileConfig = JSON.parse(process.env.PROFILE_CONFIG);
    }

    // Set defaults
    if ( typeof profileConfig.groupPermissions !== "object") {
        profileConfig.groupPermissions = {};
    }
    if ( !Array.isArray(profileConfig.profiles) ) {
        console.warn("No profiles set in config");
        profileConfig.profiles = [];
    }
    profileConfig.profiles.forEach(profile => {
        // Make sure a profile name is set
        if ( typeof profile.profileName !== "string" ) {
            throw new Error("Profile with missing profileName property (mandatory)");
        }
        // Make sure there's a default applicableToGroup
        profile.applicableToGroup = profile.applicableToGroup || "Everyone";
        // Set an empty array at least
        if ( !Array.isArray(profile.groups) ) {
            console.warn(`No groups set in config for profile '${profile.profileName}'`);
            profile.groups = [];
        }
    })

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


    // Called when user selects a profile
    app.action('select_profile', async ({ body, client, context, ack }) => {
        await ack();
        try {
            const slackUserInfo = await client.users.info({user: body.user.id});
            const userEmail = slackUserInfo.user.profile.email;
            const requestedProfileName = body.actions[0].value;
            const requestedProfile = profileConfig.profiles.find(profile => profile.profileName === requestedProfileName);
            // Make sure profile exists
            if ( requestedProfile === undefined) throw new Error(`Profile not found.`)

            const profileManager = new SlackProfileManager()
            const tgUser = await profileManager.lookupUserGroupByEmail(userEmail);
            const userGroupNames = tgUser.groups.edges.map(group => group.node.name)

            // Make sure user is allowed to access profile
            if ( !userGroupNames.includes(requestedProfile.applicableToGroup) ) throw new Error(`User '${userEmail}' has no access to profile '${requestedProfileName}'`);

            const view = await openModal(profileConfig, requestedProfile, userEmail, tgUser );
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
        await ack();
    });

    // called when a user submits a oneOf profile change
    app.view('submit_active_group_change', async ({ body, client, logger,context, ack }) => {
        await ack();
        const selectedOption = Object.values(Object.values(body.view.state.values)[0])[0].selected_option;
        const [requestedProfileName, selectedGroup] = JSON.parse(selectedOption.value)
        try {
            // TODO: can refactor this security checking into a reusable function
            const slackUserInfo = await client.users.info({user: body.user.id});
            const userEmail = slackUserInfo.user.profile.email;
            const requestedProfile = profileConfig.profiles.find(profile => profile.profileName === requestedProfileName);
            // Make sure profile exists
            if ( requestedProfile === undefined) throw new Error(`Profile not found.`)

            const profileManager = new SlackProfileManager()
            const tgUser = await profileManager.lookupUserGroupByEmail(userEmail);
            const userGroupNames = tgUser.groups.edges.map(group => group.node.name)

            // Make sure user is allowed to access profile
            if ( !userGroupNames.includes(requestedProfile.applicableToGroup) ) throw new Error(`User '${userEmail}' has no access to profile '${requestedProfileName}'`);

            // Make sure user is allowed to access selected group
            if ( !requestedProfile.groups.includes(selectedGroup) && selectedGroup !== "no_group") throw new Error(`User '${userEmail}' not allowed to access requested group '${selectedGroup}' in profile '${requestedProfileName}'`);

            if ( typeof profileConfig.groupPermissions[selectedGroup] === "string") {
                // Switching to this group requires that user is already in another group, exit if they don't have permission
                if ( !userGroupNames.includes(profileConfig.groupPermissions[selectedGroup])) throw new Error(`User '${userEmail}' has no access to group '${selectedGroup}' in profile '${requestedProfileName}' because they are not a member of required group '${profileConfig.groupPermissions[selectedGroup]}'`)
            }

            await submitChange(profileConfig, userEmail, requestedProfile, selectedGroup, tgUser);
            const homeView = await createHome(profileConfig, userEmail);
            const result = await client.views.publish({
                user_id: body.user.id,
                "view": homeView
            });
            logger.info(`User '${userEmail}' changed profile '${requestedProfileName}' to group '${selectedGroup}'`)
        }
        catch (error) {
            logger.error(error);
        }

    });
}


(async () => {
    const port = 8080
    let [slackToken, slackSigningSecret] = [
        process.env.SLACK_BOT_TOKEN,
        process.env.SLACK_SIGNING_SECRET
    ]
    // fetching secret from google cloud
    //todo: centralise all accessSecretVersion
    if (process.env.DEPLOY_ENV !== "docker") {
        [slackToken, slackSigningSecret] = [
            await accessSecretVersion('tg-group-profile-manager-bot-token'),
            await accessSecretVersion('tg-group-profile-manager-client-signing-secret')
        ]
    }



    const app = new App({
        token: slackToken,
        signingSecret: slackSigningSecret
    });
    await initApp(app);
    await app.start(process.env.PORT || port);
    console.log(`⚡️ Slack Bolt app is running on port ${port}!`);
})();