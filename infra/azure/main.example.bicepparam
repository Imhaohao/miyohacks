using './main.bicep'

param namePrefix = 'arbor'
param location = 'northcentralus'
param deployEnabled = true
param deployModelDeployments = true

// Leave empty until you have pushed a2a-worker/Dockerfile to ACR.
// Worker credentials are ignored until workerImage is populated.
param workerImage = ''
param workerBearerToken = ''
param azureOpenAIKey = ''

param agentDeploymentName = 'gpt5-agent'
param judgeBaseDeploymentName = 'arbor-judge-base'
param suggesterBaseDeploymentName = 'arbor-suggester-base'
