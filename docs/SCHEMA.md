
## Profile configuration schema
The schema consists of an object with the following properties:
- _profiles_: List of Object, where each Object defines a Profile
- _groupPermissions_: Dictionary, where each key is a group name and value is a requisite group name for being able to select it. _Optional_.

### Profile:
This object defines a single profile
- _profileName_: String, user-friendly profile name. _Required_.
- _profileType_: Enum, only `oneOf` supported currently. _Default_: `oneOf`
- _applicableToGroup_: String, a Twingate group that a user must be in for them to see this profile. _Default_: "Everyone"
- _groups_: List of String, Twingate groups within the profile which the users can switch between. _Required_.

### Example:
```json
{
  "profiles": [
    {
      "profileName": "Example Profile 1",
      "profileType": "oneOf",
      "groups": [
        "Prod",
        "Preprod",
        "Testing"
      ],
      "applicableToGroup": "Everyone"
    }
  ],
  "groupPermissions": {
    "Prod": "Admin"
  }
}
```

In the example above:
* Any user in the `Everyone` group can access the `Example Profile 1` Profile
* Any user that can access the profile can choose from `Preprod` or `Testing` groups via the Slackbot
* In order to select the `Prod` group a user must _also_ be in the requisite group named `Admin` because of the `groupPermission` object.
