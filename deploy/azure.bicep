@description('Globally unique App Service name.')
param appName string

param location string = resourceGroup().location

// This template deliberately exposes no paid SKU parameter.
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-free'
  location: location
  kind: 'linux'
  sku: {
    name: 'F1'
    tier: 'Free'
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node server.mjs'
      alwaysOn: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      appSettings: [
        { name: 'HOST', value: '0.0.0.0' }
        { name: 'NODE_ENV', value: 'production' }
        { name: 'MATCH_AI_PROVIDER', value: 'azure' }
        { name: 'ENABLE_LIVE_AI', value: 'false' }
        { name: 'MATCH_AI_MAX_CALLS', value: '16' }
        { name: 'MATCH_AI_MAX_TOKENS', value: '900' }
      ]
    }
  }
}

resource scmBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: app
  name: 'scm'
  properties: { allow: false }
}

resource ftpBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: app
  name: 'ftp'
  properties: { allow: false }
}

output appName string = app.name
output appUrl string = 'https://${app.properties.defaultHostName}'
