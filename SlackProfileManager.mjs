import {TwingateApiClient} from './TwingateApiClient.mjs';
import {accessSecretVersion} from "./utils.mjs";
import dotenvPkg from 'dotenv';
dotenvPkg.config();

//todo: centralise all accessSecretVersion
const applicationName = "Twingate-tg-group-profile-manager/0.0.1"
let [tgAccount,tgApiKey] = [process.env.TG_ACCOUNT, process.env.TG_API_KEY]
if (process.env.DEPLOY_ENV !== "docker") {
    tgAccount = await accessSecretVersion('tg-group-profile-manager-tg-account')
    tgApiKey = await accessSecretVersion('tg-group-profile-manager-tg-api-key')
}

const GroupNameToIdMap = {};

export class SlackProfileManager {
    constructor () {
        this.apiClient = new TwingateApiClient(tgAccount, tgApiKey, {
            applicationName
        });
    }

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
        // Just cache every group for now
        for ( const group of user.groups ) GroupNameToIdMap[group.name] = group.id;
        user.email = email;
        return user;
    }

    async lookUpGroupUsersByName(name){
        const query = "query GroupUserByName($name:String!){groups(filter:{name:{eq:$name}}){edges{node{id name users{pageInfo{hasNextPage endCursor} edges{node{id email}}}}}}}";
        let response = await this.apiClient.exec(query, {name: name});
        let result = response.groups;
        if ( result == null || result.edges == null || result.edges.length < 1 ) return null;
        let group = result.edges[0].node;
        if ( group.users.pageInfo.hasNextPage === true ) {
            let userQuery = this.apiClient.getRootNodePagedQuery("GroupUsers", "group", "users", ["id", "email"])
            let userResults = await this.apiClient.fetchAllRootNodePages(userQuery, {id: group.id, pageInfo: group.users.pageInfo});
            for ( const user of userResults ) group.users.edges.push({node: user})
        }
        group.users = group.users.edges.map(group => group.node);
        return group;
    }


    async fetchAllGroups(opts) {
        return this.apiClient._fetchAllNodesOfType("Group", opts);
    }

    async lookupGroupByName(name) {
        if ( GroupNameToIdMap[name] ) return GroupNameToIdMap[name];
        const query = "query GroupByName($name:String){groups(filter:{name:{eq:$name}}){edges{node{id}}}}";
        let response = await this.apiClient.exec(query, {name: ""+name.trim()});
        let result = response.groups;
        if ( result.edges.length < 1 ) throw new Error(`Group not found in Twingate: '${name}'`);
        const group = result.edges[0].node;
        if ( group.id != null ) GroupNameToIdMap[group] = group.id;
        return group.id;
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
