import boltPkg from '@slack/bolt';
import {createHome} from "./appHome.mjs";
import {OneOfProfile} from "./profileFlows/OneOf.mjs";
import dotenvPkg from 'dotenv';
import {accessSecretVersion} from "./utils.mjs";
import {SlackProfileManager} from "./SlackProfileManager.mjs";
import {SelfServeApproval} from "./profileFlows/SelfServeApproval.mjs";

const {App} = boltPkg;
dotenvPkg.config();

async function loadProfiles(app) {
    // fetching secret from google cloud
    //todo: centralise all accessSecretVersion
    let profileConfig = ""
    if (process.env.DEPLOY_ENV !== "docker") {
        profileConfig = JSON.parse(await accessSecretVersion('tg-group-profile-manager-profile-config'));
    } else {
        profileConfig = JSON.parse(process.env.PROFILE_CONFIG.replaceAll("'", ""));
    }

    // Set defaults
    if (typeof profileConfig.groupPermissions !== "object") {
        profileConfig.groupPermissions = {};
    }
    if (!Array.isArray(profileConfig.profiles)) {
        console.warn("No profiles set in config");
        profileConfig.profiles = [];
    }
    profileConfig.profiles.forEach(profile => {
        // Make sure a profile name is set
        if (typeof profile.profileName !== "string") {
            throw new Error("Profile with missing profileName property (mandatory)");
        }
        // Make sure there's a default applicableToGroup
        profile.applicableToGroup = profile.applicableToGroup || "Everyone";
        // Set an empty array at least
        if (!Array.isArray(profile.groups)) {
            console.warn(`No groups set in config for profile '${profile.profileName}'`);
            profile.groups = [];
        }
    });
    profileConfig.profiles = profileConfig.profiles.map( (profile, index) => {
        switch (profile.profileType) {
            case "oneOf": return new OneOfProfile(app, profileConfig, index);
            case "selfServeApproval": return new SelfServeApproval(app, profileConfig, index);
            default: return profile;
        }
    });
    return profileConfig;
}

async function initApp(app) {
    const profileConfig = await loadProfiles(app);

    const refreshHome = async function (userId, userEmail) {
        const homeView = await createHome(profileConfig, userEmail);
        return await app.client.views.publish({
            user_id: userId,
            "view": homeView
        });
    }

    const lookupTgUserFromSlackUserId = async function(userId) {
        const slackUserInfo = await app.client.users.info({user: userId});
        const userEmail = slackUserInfo.user.profile.email;

        const profileManager = new SlackProfileManager()
        return await profileManager.lookupUserGroupByEmail(userEmail);
    }

    app.refreshHome = refreshHome;
    app.lookupTgUserFromSlackUserId = lookupTgUserFromSlackUserId;


    // Listen for users opening your App Home
    app.event('app_home_opened', async ({event, client, logger}) => {
        try {
            const slackUserInfo = await client.users.info({user: event.user});
            await refreshHome(event.user, slackUserInfo.user.profile.email);
            logger.info(`${event.user} opened app home.`)
        } catch (error) {
            logger.error(error);
        }
    });


    // dummy action watcher for multi static select
    app.action('change_group', async ({body, context, ack}) => {
        await ack();
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