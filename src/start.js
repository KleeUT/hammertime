const startASGs = require('./asgs/startASGs');
const listASGsToStart = require('./asgs/listASGsToStart');
const untagASGs = require('./asgs/untagASGs');
const resumeASGs = require('./asgs/resumeASGs');
const listASGsToResume = require('./asgs/listASGsToResume');
const untagResumedASGs = require('./asgs/untagResumedASGs');
const startInstances = require('./instances/startInstances');
const listInstancesToStart = require('./instances/listInstancesToStart');
const untagInstances = require('./instances/untagInstances');
const listDBInstancesToStart = require('./rds/listDBInstancesToStart');
const startDBInstances = require('./rds/startDBInstances');
const untagDBInstances = require('./rds/untagDBInstances');

function startAllInstances({ dryRun, currentOperatingTimezone }) {
  return listInstancesToStart(currentOperatingTimezone)
    .then((startableInstances) => {
      if (dryRun) {
        console.log('Dry run is enabled, will not start or untag any instances.');
        console.log(`Found the following ${startableInstances.length} instances that would have been to started`);
        startableInstances.forEach((instance) => {
          console.log(instance);
        });

        return [];
      }

      if (startableInstances.length === 0) {
        console.log('No instances found to start, moving on...');
        return [];
      }

      console.log(`Found the following ${startableInstances.length} instances to start ...`);
      startableInstances.forEach((instance) => {
        console.log(instance);
      });

      return startInstances(startableInstances).then((startedInstanceIds) => {
        console.log('Finished starting instances. Moving on to untag them.');
        return untagInstances(startedInstanceIds);
      });
    });
}

function spinUpASGs({ dryRun, currentOperatingTimezone }) {
  return listASGsToStart(currentOperatingTimezone)
    .then((startableASGs) => {
      if (dryRun) {
        console.log('Dry run is enabled, will not start or untag any ASGs.');
        console.log(`Found the following ${startableASGs.length} auto scaling groups that would have been spun up`);
        startableASGs.forEach((asg) => {
          console.log(asg.AutoScalingGroupName);
        });
        return [];
      }

      if (startableASGs.length === 0) {
        console.log('No ASGs to spin up, moving on...');
        return [];
      }

      console.log(`Found the following ${startableASGs.length} auto scaling groups to spin up...`);
      startableASGs.forEach((asg) => {
        console.log(asg.AutoScalingGroupName);
      });

      return startASGs(startableASGs).then((startedASGs) => {
        console.log(`Finished spinning up ASGs. Moving on to untag ${startedASGs.length} of them.`);
        return untagASGs(startedASGs);
      });
    });
}

function resumeASGInstances({ dryRun, currentOperatingTimezone }) {
  return listASGsToResume(currentOperatingTimezone)
    .then((resumeableASGs) => {
      if (dryRun) {
        console.log('Dry run is enabled, will not start or untag any ASGs.');
        console.log(`Found the following ${resumeableASGs.length} auto scaling groups that would have been resumed and ec2 instances started...`);
        resumeableASGs.forEach((asg) => {
          console.log(asg.AutoScalingGroupName);
          const startedInstances = asg.Instances.map(insts => console.log(insts.InstanceId));
          return Promise.all(startedInstances);
        });
        return [];
      }

      if (resumeableASGs.length === 0) {
        console.log('No ASGs to resume, moving on...');
        return [];
      }

      console.log(`Found the following ${resumeableASGs.length} auto scaling groups to resume...`);
      resumeableASGs.forEach((asg) => {
        console.log(asg.AutoScalingGroupName);
      });

      console.log(`Starting EC2 instances and resuming ASGs.`);
      return resumeableASGs.forEach((asg) => {
        const startedInstances = asg.Instances.map(insts => {
          console.log(`Starting instance with id: ${insts.InstanceId}`)
          startInstances([insts.InstanceId])
        });
        return Promise.all(startedInstances)
        .then((started) => {
          console.log(`Started: ${started}`)
          if (started.length > 0) {
            return resumeASGs(resumeableASGs).then((resumedASGs) => {
              console.log(`Finished resuming ASGs and starting instances. Moving on to untag ${resumedASGs.length} of them.`);
              return untagResumedASGs(resumedASGs);
            })
          }
          return [];
        })
      })
    });
}

function startAllDBInstances(dryRun) {
  return listDBInstancesToStart()
    .then((arns) => {
      if (dryRun) {
        console.log('Dry run is enabled, will not start or untag any RDS instances.');
        return [];
      }
      return arns;
    })
    .then((arns) => {
      if (arns.length === 0) {
        console.log('There are no RDS instances to start today. See you the next time.');
        return [];
      }

      return startDBInstances(arns)
        .then((startedDBInstanceARNs) => {
          console.log('Finished starting RDS instances. Moving on to untag them.');
          return untagDBInstances(startedDBInstanceARNs);
        });
    })
    .then((arns) => {
      if (arns.length > 0) {
        console.log('Finished tagging RDS instances.');
      }
    });
}

module.exports = function start(options) {
  const { event, callback, dryRun } = options;
  const currentOperatingTimezone = event.currentOperatingTimezone;
  console.log(`Hammertime start for ${currentOperatingTimezone}`);
  Promise.all([
    startAllDBInstances(dryRun),
    startAllInstances({ dryRun, currentOperatingTimezone }),
    spinUpASGs({ dryRun, currentOperatingTimezone }),
    resumeASGInstances({ dryRun, currentOperatingTimezone }),
  ]).then(() => {
    if (!dryRun) {
      console.log('All EC2, RDS instances and ASGs started successfully. Good morning!');
    }
    callback(null, {
      message: 'Start: Hammertime successfully completed.',
    }, event);
  }).catch((err) => {
    console.error(err);
    callback(err);
  });
};
