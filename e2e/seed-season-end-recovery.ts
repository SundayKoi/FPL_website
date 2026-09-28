import { seedSeasonEndFixture } from "./season-end-fixture";

seedSeasonEndFixture("recovery")
  .then(({ releaseId, pendingRequestId }) => {
    console.log(`FPL_TEST_FIXTURE_ID=${releaseId}`);
    console.log(`FPL_TEST_PENDING_REQUEST_ID=${pendingRequestId}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
