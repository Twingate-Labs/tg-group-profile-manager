import boltPkg from '@slack/bolt';
import boltSubtype from '@slack/bolt';
import {createHome} from "./appHome.mjs";
import {OneOfProfile} from "./profileFlows/OneOf.mjs";
import dotenvPkg from 'dotenv';
import {accessSecretVersion} from "./utils.mjs";
import {SlackProfileManager} from "./SlackProfileManager.mjs";
import {SelfServeApproval} from "./profileFlows/SelfServeApproval.mjs";

const {App} = boltPkg;
const {subtype} = boltSubtype
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
            default:
                console.error(`Unknown profile type: ${JSON.stringify(profile)}` );
                return null;
        }
    });
    profileConfig.profiles = profileConfig.profiles.filter(p => p !== null);
    return profileConfig;
}

async function startUpCleanUp (app) {
    const botInfo = await app.client.auth.test()
    const selfMessage = await app.client.chat.postMessage({channel: botInfo.user_id, text: "Service Started!"})
    const conversations = await app.client.conversations.history({channel: selfMessage.channel, oldest: Number(selfMessage.ts)-(60*60*24*3)})
    const grantMessages =  conversations.messages.filter(message => message.text.startsWith(SelfServeApproval.GRANT_ACCESS_MESSAGE)).map(message => JSON.parse(message.text.replace(SelfServeApproval.GRANT_ACCESS_MESSAGE, ""))) || []
    const revokeMessages = conversations.messages.filter(message => message.text.startsWith(SelfServeApproval.REVOKE_ACCESS_MESSAGE)).map(message => JSON.parse(message.text.replace(SelfServeApproval.REVOKE_ACCESS_MESSAGE, ""))) || []
    const revokeMessageIds = revokeMessages.map(revokeMessage => revokeMessage.requestId)
    const missingRevokeMessages = grantMessages.filter(grantMessage => !revokeMessageIds.includes(grantMessage.requestId))

    const profileManager = new SlackProfileManager()
    const timeNow = Date.now()/1000
    for (const missingRevokeMessage of missingRevokeMessages) {
        if (missingRevokeMessage.expiry < timeNow) {
            await profileManager.removeUserFromGroup(missingRevokeMessage.requestedGroupId, missingRevokeMessage.requesterTwingateId)
            // post duration access revoked message to self
            await app.client.chat.postMessage({
                channel: botInfo.user_id,
                text: `${SelfServeApproval.REVOKE_ACCESS_MESSAGE}${JSON.stringify(missingRevokeMessage)}`,
            })
            console.log(`User ${missingRevokeMessage.requesterEmail} profile _'${missingRevokeMessage.requestedProfile}'_ access expired but not yet revoked, revoking now. Group: ${missingRevokeMessage.requestedGroupName} Duration: ${missingRevokeMessage.selectedTime}`)
        }
    }
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
            // logger.info(`${event.user} opened app home.`)
        } catch (error) {
            logger.error(error);
        }
    });


    // dummy action watcher for static select
    app.action('change_group', async ({body, context, ack}) => {
        await ack();
    });

    // dummy action watcher for change time option
    app.action('change_time_option', async ({body, context, ack}) => {
        await ack();
    });

    // dummy action watcher for group access request
    app.action('request_access', async ({body, context, ack}) => {
        await ack();
    });

    // dummy action watcher for requester rejected and approved buttons
    app.action('dummy', async ({body, context, ack}) => {
        await ack();
    });

    // dummy action watcher for requester has access to all the groups
    app.action('has_all_access', async ({body, context, ack}) => {
        await ack();
    });


    // app.message("", async ({event, body, context, ack}) => {
    //     await ack()
    //     console.log()
    // });

    // app.message(subtype("bot_message"), async ({event, body, context, ack}) => {
    //     console.log()
    // });


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
        signingSecret: slackSigningSecret,
        ignoreSelf: false
    });
    await initApp(app);

    await app.start(process.env.PORT || port);
    console.log(`⚡️ Slack Bolt app is running on port ${port}!`);

    // todo: confirm the block below is not preventing the bot to accept event in Cloudrun without no cpu throttling
    console.log(`Checking all expired duration based accesses are revoked.`)
    await startUpCleanUp(app)
    console.log(`All expired duration based accesses are revoked.`)

})();