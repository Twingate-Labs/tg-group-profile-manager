
### Deploy on Google CloudRun (manual)
1. Open Google [Cloud Shell](https://cloud.google.com/shell)
2. Clone the project `git clone https://github.com/Twingate-Labs/tg-group-profile-manager.git`
3. `cd tg-group-profile-manager` and populate `tg-group-profile-manager.conf`
    - `SLACK_SECRET` can be found at the page "Basic Information" in Slack API app page
    - `SLACK_BOT_TOKEN` can be found at page "OAuth & Permissions"
    - `TG_API_KEY` can be generated in the Setting page within the Twingate Admin Console (Read and Write Token is required)
    - `TG_ACCOUNT` replace with your Twingate Network Address (e.g. test1.twingate.com)
4. Update the file `profile_config.json`
    - profiles: List of Object, where each Object defines a group profile
    - profileName: User friendly group profile name
    - groups: List of Twingate groups within the profile which the users can switch to
    - applicableToGroup: A Twingate group which the users within it can access the group profile, set to 'Everyone' to give all Twingate users the access to the group profile
5. Execute the following commands to deploy CloudRun
```
gcloud config set compute/zone europe-west2-a # change to your preferred zone
gcloud config set run/region europe-west2 # change to your preferred region
export PROJECT_ID=$(gcloud config list --format 'value(core.project)')
export SERVICE_ACCOUNT=$(gcloud iam service-accounts list --format 'value(EMAIL)' --filter 'NAME:Compute Engine default service account')
./cloudrun_setup.sh
```
4. Copy out the URL of the Slack app, e.g. `https://tg-group-profile-manager-xxxxx-nw.a.run.app`
5. (Optional) Improve Performance
   * The Cloud Run can take between 10-20 seconds to process the switch group requests with the default Cloud Run configuration
   * (Recommended) [CPU is always allocated](https://cloud.google.com/run/docs/configuring/cpu-allocation#setting) can be enabled in Cloud Run to improve performance (to 1-2 seconds)
   * (Alternatively) Cloud Run [CPU boost](https://cloud.google.com/blog/products/serverless/announcing-startup-cpu-boost-for-cloud-run--cloud-functions) can be enabled in Cloud Run, but the improvement is not as significant as [CPU is always allocated](https://cloud.google.com/run/docs/configuring/cpu-allocation#setting)
