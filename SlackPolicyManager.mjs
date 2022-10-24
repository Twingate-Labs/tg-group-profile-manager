import {TwingateApiClient} from './TwingateApiClient.mjs'

export class SlackPolicyManager {
    constructor () {
        const applicationName = "tg-slack-policy-manager"
        this.apiClient = new TwingateApiClient(process.env.TG_ACCOUNT, process.env.TG_API_KEY, {
            applicationName
        });
    }

    // todo: only gets first 50 groups
    async lookupUserGroupByEmail(email) {
        const query = "query UserByEmail($email:String){users(filter:{email:{eq:$email}}){edges{node{id groups{edges{node{id name}}}}}}}";
        let response = await this.apiClient.exec(query, {email: ""+email.trim()});
        let result = response.users;
        if ( result == null || result.edges == null || result.edges.length < 1 ) return null;
        return result.edges[0].node;
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
