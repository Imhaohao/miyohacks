@description('Short prefix used for Azure resource names.')
@minLength(2)
@maxLength(10)
param namePrefix string = 'arbor'

@description('Azure region. Use a region where your Azure OpenAI quota and fine-tuning access exist, e.g. northcentralus or swedencentral.')
param location string = resourceGroup().location

@description('Set false to deploy nothing from this template. Use scripts/azure-off.mjs for runtime shutoff after deployment.')
param deployEnabled bool = true

@description('Create base Azure OpenAI deployments for Arbor runtime. Quota/model availability can vary by tenant and region.')
param deployModelDeployments bool = true

@description('Optional container image for the standalone a2a-worker. Leave empty to skip Container Apps worker deployment.')
param workerImage string = ''

@description('Bearer token required by the worker, if you want Arbor to call it with ARBOR_WORKER_BEARER.')
@secure()
param workerBearerToken string = ''

@description('Azure OpenAI API key injected into the optional Container Apps worker.')
@secure()
param azureOpenAIKey string = ''

@description('GPT-5 Azure OpenAI deployment name used by Arbor agent execution.')
param agentDeploymentName string = 'gpt5-agent'

@description('Base model deployment name for judge traffic until a fine-tuned judge deployment replaces it.')
param judgeBaseDeploymentName string = 'arbor-judge-base'

@description('Base model deployment name for suggester traffic until a fine-tuned suggester deployment replaces it.')
param suggesterBaseDeploymentName string = 'arbor-suggester-base'

@description('Fine-tuning and runtime tags.')
param tags object = {
  project: 'arbor'
  owner: 'yanzihao'
  costCenter: 'azure-credits'
}

var safePrefix = toLower(replace(namePrefix, '-', ''))
var suffix = uniqueString(resourceGroup().id, namePrefix)
var openAIAccountName = toLower('${safePrefix}aoai${suffix}')
var searchName = toLower('${safePrefix}-search-${suffix}')
var storageName = toLower('${safePrefix}store${suffix}')
var logName = '${namePrefix}-logs-${suffix}'
var envName = '${namePrefix}-apps-${suffix}'
var workerName = '${namePrefix}-worker'
var hasWorkerSecrets = !empty(workerBearerToken) && !empty(azureOpenAIKey)
var deployWorker = deployEnabled && !empty(workerImage) && hasWorkerSecrets

resource openai 'Microsoft.CognitiveServices/accounts@2024-10-01' = if (deployEnabled) {
  name: openAIAccountName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  tags: tags
  properties: {
    customSubDomainName: openAIAccountName
    publicNetworkAccess: 'Enabled'
  }
}

resource agentDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = if (deployEnabled && deployModelDeployments) {
  parent: openai
  name: agentDeploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: 1
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-5'
      version: '2025-08-07'
    }
  }
}

resource judgeBaseDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = if (deployEnabled && deployModelDeployments) {
  parent: openai
  name: judgeBaseDeploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: 1
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4.1-mini'
      version: '2025-04-14'
    }
  }
}

resource suggesterBaseDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = if (deployEnabled && deployModelDeployments) {
  parent: openai
  name: suggesterBaseDeploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: 1
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4.1-mini'
      version: '2025-04-14'
    }
  }
}

resource search 'Microsoft.Search/searchServices@2024-06-01-preview' = if (deployEnabled) {
  name: searchName
  location: location
  sku: {
    name: 'basic'
  }
  tags: tags
  properties: {
    hostingMode: 'default'
    partitionCount: 1
    replicaCount: 1
    publicNetworkAccess: 'enabled'
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = if (deployEnabled) {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  tags: tags
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
  }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = if (deployEnabled) {
  name: logName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appEnv 'Microsoft.App/managedEnvironments@2024-03-01' = if (deployWorker) {
  name: envName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource worker 'Microsoft.App/containerApps@2024-03-01' = if (deployWorker) {
  name: workerName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: appEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 4000
        allowInsecure: false
        transport: 'auto'
      }
      secrets: [
        {
          name: 'azure-openai-api-key'
          value: azureOpenAIKey
        }
        {
          name: 'worker-bearer-token'
          value: workerBearerToken
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: workerImage
          env: [
            {
              name: 'PORT'
              value: '4000'
            }
            {
              name: 'ARBOR_MODEL_PROVIDER'
              value: 'azure-openai'
            }
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: 'https://${openAIAccountName}.openai.azure.com'
            }
            {
              name: 'AZURE_OPENAI_API_KEY'
              secretRef: 'azure-openai-api-key'
            }
            {
              name: 'AZURE_OPENAI_API_MODE'
              value: 'responses'
            }
            {
              name: 'AZURE_OPENAI_AGENT_DEPLOYMENT'
              value: agentDeploymentName
            }
            {
              name: 'WORKER_BEARER_TOKEN'
              secretRef: 'worker-bearer-token'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
    }
  }
}

output azureOpenAIEndpoint string = deployEnabled ? 'https://${openAIAccountName}.openai.azure.com' : ''
output azureOpenAIAccountName string = deployEnabled ? openAIAccountName : ''
output agentDeployment string = deployEnabled && deployModelDeployments ? agentDeployment.name : ''
output judgeBaseDeployment string = deployEnabled && deployModelDeployments ? judgeBaseDeployment.name : ''
output suggesterBaseDeployment string = deployEnabled && deployModelDeployments ? suggesterBaseDeployment.name : ''
output searchEndpoint string = deployEnabled ? 'https://${search.name}.search.windows.net' : ''
output storageAccountName string = deployEnabled ? storage.name : ''
output workerUrl string = deployWorker ? 'https://${worker.properties.configuration.ingress.fqdn}' : ''
output workerDeploymentSkippedReason string = deployEnabled && !empty(workerImage) && !hasWorkerSecrets ? 'workerImage was set but workerBearerToken and azureOpenAIKey are both required, so the worker was not deployed.' : ''
