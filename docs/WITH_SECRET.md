## Create Secret
base64 encode all values, i.e
```
echo -n '{YOUR_SLACK_SIGNING_SECRET}' | base64
echo -n '{YOUR_SLACK_BOT_TOKEN}' | base64
echo -n '{YOUR_TG_API_KEY}' | base64
echo -n '{YOUR_TG_ACCOUNT}' | base64
echo -n '{YOUR_PROFILE_CONFIG}' | base64
```

Create secret template using the encoded values from the previous step, secret.yaml
```secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: tg-group-profile-manager
type: Opaque
data:
  SLACK_SIGNING_SECRET: xxx
  SLACK_BOT_TOKEN: xxx
  TG_API_KEY: xxx
  TG_ACCOUNT: xxx
  PROFILE_CONFIG: xxx
  DEPLOY_ENV: ZG9ja2Vy
```

## Deploy Secret and Helm
```
kubectl apply -f secret.yaml
helm repo add twingate-labs https://twingate-labs.github.io/tg-group-profile-manager-helm/
helm install tg-group-profile-manager twingate-labs/tg-group-profile-manager -n [namespace] \
    --set externalSecret.name=tg-group-profile-manager
```
