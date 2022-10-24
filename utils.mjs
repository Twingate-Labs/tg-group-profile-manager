import {SecretManagerServiceClient} from '@google-cloud/secret-manager';

export async function accessSecretVersion (name) {
    const client = new SecretManagerServiceClient()
    const projectId = process.env.PROJECT_ID
    const [version] = await client.accessSecretVersion({
        name: `projects/${projectId}/secrets/${name}/versions/1`
    })
    const payload = version.payload.data.toString('utf8')
    return payload
}