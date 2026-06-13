targetScope = 'subscription'

@description('Budget name shown in Cost Management.')
param budgetName string = 'arbor-azure-credits-guardrail'

@description('Monthly budget amount in USD. Set below your actual credits to leave buffer.')
param monthlyAmount int = 9500

@description('Email address for Azure Cost Management alerts.')
param alertEmail string

@description('Budget start date in ISO format. Use the first day of the current month.')
param startDate string

@description('Budget end date in ISO format.')
param endDate string = '2027-06-01T00:00:00Z'

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: budgetName
  properties: {
    category: 'Cost'
    amount: monthlyAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: startDate
      endDate: endDate
    }
    notifications: {
      actual50: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 50
        thresholdType: 'Actual'
        contactEmails: [
          alertEmail
        ]
      }
      actual80: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: [
          alertEmail
        ]
      }
      actual95: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 95
        thresholdType: 'Actual'
        contactEmails: [
          alertEmail
        ]
      }
      forecast90: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 90
        thresholdType: 'Forecasted'
        contactEmails: [
          alertEmail
        ]
      }
    }
  }
}
