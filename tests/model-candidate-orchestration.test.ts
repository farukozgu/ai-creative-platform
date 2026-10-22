import assert from "node:assert/strict";
import test from "node:test";
import { candidateExecutionGate, candidateObjectPath, canFinalizeClaim } from "@/lib/models/candidate-orchestration";
const claim={jobId:"job",leaseToken:"token",leaseVersion:1,ownerId:"owner",modelId:"model"};
test("candidate orchestration remains closed and fenced",()=>{assert.deepEqual(candidateExecutionGate(),{scheduler:false,executor:false,billing:"closed"});assert.equal(canFinalizeClaim(claim,claim),true);assert.equal(canFinalizeClaim(claim,{...claim,leaseVersion:2}),false);});
test("candidate output path is server-controlled",()=>assert.equal(candidateObjectPath(claim,"candidate"),"owner/model/candidate-candidate.png"));
