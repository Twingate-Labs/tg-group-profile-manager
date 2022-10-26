
## Profile configuration schema
The schema consists of an object with the following properties:
- _profiles_: List of Object, where each Object defines a Profile

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
  ]
}
```