

export class BaseProfile {
    constructor(app, profileConfig, index) {
        this.profileName = "";
        this.applicableToGroup = "Everyone";
        Object.assign(this, profileConfig.profiles[index]);
        this.profileIndex = index;
        this.profileConfig = profileConfig;
        this.app = app;
    }

    async getAppHomeBlock(tgUser) {
        return null;
    }
}