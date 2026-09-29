import { seedSeasonEndFixture } from "./season-end-fixture";

seedSeasonEndFixture("recovery")
  .then(({ releaseId }) => {
    console.log(`FPL_TEST_FIXTURE_ID=${releaseId}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
