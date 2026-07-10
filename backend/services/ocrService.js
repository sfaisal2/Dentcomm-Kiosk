async function extractIdDataFromImage(imageUrl) {
  return {
    legalName: "Aisha Khan",
    dob: "01/15/1998",
    address: "123 Main Street, Houston, TX 77001",
    idNumber: "TX1234567",
    issueDate: "04/01/2024",
    stateOfIssue: "TX",
    confidenceScore: 92,
    source: "ocr_mock",
    imageUrl
  };
}

async function extractInsuranceDataFromImage(frontImageUrl, backImageUrl) {
  return {
    carrier: "Delta Dental",
    memberId: "ABC123456",
    groupNumber: "GRP789",
    planType: "PPO",
    payerId: "DD001",
    subscriberName: "Aisha Khan",
    effectiveDate: "01/01/2026",
    confidenceScore: 90,
    source: "ocr_mock",
    frontImageUrl,
    backImageUrl
  };
}

module.exports = {
  extractIdDataFromImage,
  extractInsuranceDataFromImage
};
