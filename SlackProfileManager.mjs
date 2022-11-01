import {TwingateApiClient} from './TwingateApiClient.mjs';
import {accessSecretVersion} from "./utils.mjs";
import dotenvPkg from 'dotenv';
dotenvPkg.config();

//todo: centralise all accessSecretVersion
const applicationName = "tg-group-profile-manager"
let [tgAccount,tgApiKey] = [process.env.TG_ACCOUNT, process.env.TG_API_KEY]
if (process.env.DEPLOY_ENV !== "docker") {
    tgAccount = await accessSecretVersion('tg-group-profile-manager-tg-account')
    tgApiKey = await accessSecretVersion('tg-group-profile-manager-tg-api-key')
}

export class SlackProfileManager {
    constructor () {
        this.apiClient = new TwingateApiClient(tgAccount, tgApiKey, {
            applicationName
        });
    }

    // todo: only gets first 50 groups
    async lookupUserGroupByEmail(email) {
        const query = "query UserByEmail($email:String){users(filter:{email:{eq:$email}}){edges{node{id groups{pageInfo{hasNextPage endCursor} edges{node{id name}}}}}}}";
        let response = await this.apiClient.exec(query, {email: ""+email.trim()});
        let result = response.users;
        if ( result == null || result.edges == null || result.edges.length < 1 ) return null;
        let user = result.edges[0].node;
        if ( user.groups.pageInfo.hasNextPage === true ) {
            let groupQuery = this.apiClient.getRootNodePagedQuery("UserGroups", "user", "groups", ["id", "name"])
            let groupResults = await this.apiClient.fetchAllRootNodePages(groupQuery, {id: user.id, pageInfo: user.groups.pageInfo});
            for ( const group of groupResults ) user.groups.edges.push({node: group})
        }
        user.groups = user.groups.edges.map(group => group.node);
        return user;
    }


    async fetchAllGroups(opts) {
        return this.apiClient._fetchAllNodesOfType("Group", opts);
    }

    async lookupGroupByName(name) {
        const query = "query GroupByName($name:String){groups(filter:{name:{eq:$name}}){edges{node{id}}}}";
        let response = await this.apiClient.exec(query, {name: ""+name.trim()});
        let result = response.groups;
        if ( result == null || result.edges == null || result.edges.length < 1 ) return null;
        return result.edges[0].node.id;
    }

    async lookupUserByEmail(email) {
        const query = "query UserByEmail($email:String){users(filter:{email:{eq:$email}}){edges{node{id}}}}";
        let response = await this.apiClient.exec(query, {email: ""+email.trim()});
        let result = response.users;
        if ( result == null || result.edges == null || result.edges.length < 1 ) return null;
        return result.edges[0].node.id;
    }

    async addUserToGroup(groupId, userId) {
        let userIds = ( Array.isArray(userId) ? userId : [userId]);
        const groupQuery = "mutation AddUserToGroup($groupId:ID!,$userIds:[ID]){groupUpdate(id:$groupId,addedUserIds:$userIds){error entity{id name users{edges{node{id email}}}}}}";
        let groupsResponse = await this.apiClient.exec(groupQuery, {groupId, userIds} );
        return groupsResponse;
    }

    async removeUserFromGroup(groupId, userId) {
        let userIds = ( Array.isArray(userId) ? userId : [userId]);
        const groupQuery = "mutation RemoveUserFromGroup($groupId:ID!,$userIds:[ID]){groupUpdate(id:$groupId,removedUserIds:$userIds){error entity{id name users{edges{node{id email}}}}}}";
        let groupsResponse = await this.apiClient.exec(groupQuery, {groupId, userIds} );
        return groupsResponse;
    }

}
