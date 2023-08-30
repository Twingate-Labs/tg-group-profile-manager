# Example Command
```
helm install tg-group-profile-manager twingate-labs/tg-group-profile-manager \
--set variables.twingateAccount="xxxx" \
--set variables.twingateApiKey="xxxx" \
--set variables.slackSigningSecret="xxxx" \
--set variables.slackBotToken="xoxb-xxxx" \
--set ingress.enabled="true" \
--set ingress.hosts[0].host="xxxx.com" \
--set service.type="ClusterIP" \
--set ingress.hosts[0].paths[0].path="/" \
--set ingress.hosts[0].paths[0].pathType="Prefix" \
--set ingress.tls[0].hosts[0]="xxxx.com" \
--set ingress.tls[0].secretName="xxxx" \
--set-json='variables.profileConfig={"profiles":[{"profileName":"Example One Of Profile 1","profileType":"oneOf","groups":["Prod","Preprod","Testing"],"applicableToGroup":"Everyone"},{"profileName":"Example One Of Profile 2","profileType":"oneOf","groups":["US","EU","ASIA"],"applicableToGroup":"Everyone"},{"profileName":"Example Self-Serve Business Approvals","profileType":"selfServeApproval","groups":["HR","Finance","Sales"],"timeOptions": ["Forever", "1h", "8h", "24h", "7d", "30d", "90d"],"applicableToGroup":"Everyone","approverGroup":"IT"}, {"profileName":"Example Self-Serve Business Approvals 2","profileType":"selfServeApproval","groups":["HR","Finance","Sales"],"timeOptions": ["Forever", "1h", "8h", "24h"],"applicableToGroup":"Everyone","approverGroup":"IT"}],"groupPermissions":{"Prod":"Admin"}}'
```

- `ingress.hosts[0].host` ingress exit address
- `ingress.tls[0].secretName` tls secret name