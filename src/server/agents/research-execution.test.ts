import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDomain, normalizeWebsite, normalizeCompanyName, sameCompany, deduplicateCompanies, publicWebsiteSchema } from "@/lib/company-identity";
import { calculateLeadScore, scoreComponentsSchema, researchOutputSchema, validateResearchAnalysis, validateDiscovery, isQualified } from "@/lib/validation/research";
import { nextResearchTask, supportsResearchTask } from "./research-orchestrator";
import { researchAnalysis, researchSources } from "./testing/research-fixtures";
import { workflowTaskRowSchema } from "@/lib/validation/rows";
import { researchCompanyLimit } from "./research-budget";

function task(position: number, type: string, status = "pending", dependencies: string[] = []) {
  return workflowTaskRowSchema.parse({ id: `00000000-0000-4000-8000-${String(position).padStart(12,"0")}`,workspace_id:"00000000-0000-4000-8000-000000000099",workflow_id:"00000000-0000-4000-8000-000000000098",
    type,title:type,description:type,status,position,input:{ planTaskId:`task_${position}`,objective:type,expectedOutput:type,dependencies },output:null,error:null,started_at:null,completed_at:null,created_at:"2026-10-01",updated_at:"2026-10-01" });
}
test("company identity normalizes domain variants, canonical websites and legal suffixes", () => {
  for (const website of ["example.com", "https://example.com", "https://www.EXAMPLE.com/", "http://example.com/product?campaign=1#team"]) assert.equal(normalizeDomain(website), "example.com");
  assert.equal(normalizeWebsite("https://www.example.com/product?campaign=1#team"),"https://example.com");
  for (const name of ["Acme", "Acme Inc.", "ACME", "Acme LLC"]) assert.equal(normalizeCompanyName(name), "acme");
});
test("deduplication prefers domains and never merges equal names with distinct known websites", () => {
  const companies = [{name:"Acme Inc.",website:"https://www.example.com"},{name:"ACME",website:"http://example.com/"},{name:"Acme",website:"https://different.com"}];
  assert.equal(deduplicateCompanies(companies).length, 2);
  assert.equal(sameCompany(companies[0], { name: "ACME", website: null }),true);
  assert.equal(sameCompany(companies[0], companies[2]),false);
  assert.equal(deduplicateCompanies([{name:"Acme",website:null},companies[0]])[0].website,companies[0].website);
});
test("public URL validation rejects credentials, private hosts, ports, unsafe schemes and obfuscated IPs", () => {
  for (const url of ["http://localhost./", "http://metadata.google.internal./", "not-a-url", "https://["]) assert.equal(publicWebsiteSchema.safeParse(url).success,false,url);
  for (const url of ["file:///etc/passwd","data:text/html,hello","javascript:alert(1)","http://localhost/","http://127.1/","http://0x7f000001/","http://[::1]/","http://10.0.0.1/","https://example.internal/","https://user:pass@example.com/","https://example.com:8080/"]) assert.equal(publicWebsiteSchema.safeParse(url).success,false,url);
});
test("rubric calculates a bounded score server-side and rejects invalid components", () => {
  assert.equal(calculateLeadScore(researchAnalysis.lead.components),68);
  assert.equal(calculateLeadScore({icpFit:25,automationPotential:30,operationalSignals:20,evidenceQuality:15,reachability:10}),100);
  assert.equal(calculateLeadScore({icpFit:0,automationPotential:0,operationalSignals:0,evidenceQuality:0,reachability:0}),0);
  for (const icpFit of [-1,26,1.5]) assert.equal(scoreComponentsSchema.safeParse({...researchAnalysis.lead.components,icpFit}).success,false);
});
test("research output excludes outreach and validates score range, company names and sources", () => {
  const output = {company:{name:"Fixture",website:"https://fixture.example.com"},sources:researchSources,analysis:researchAnalysis,queries:[],budget:{searchRequests:2,searchCreditsReserved:2,modelRequests:1,cacheHits:0},researchOnly:true};
  assert.ok(researchOutputSchema.safeParse(output).success);
  for (const score of [-1,137]) assert.equal(researchOutputSchema.safeParse({...output,analysis:{...researchAnalysis,lead:{...researchAnalysis.lead,score}}}).success,false);
  assert.equal(researchOutputSchema.safeParse({...output,outreach:{subject:"draft",body:"message"}}).success,false);
  assert.equal(researchOutputSchema.safeParse({...output,company:{...output.company,name:" "}}).success,false);
  assert.equal(researchOutputSchema.safeParse({...output,sources:[]}).success,false);
});
test("confidence cannot be high with weak evidence and qualification requires ICP and evidence fit", () => {
  const weak = structuredClone(researchAnalysis); weak.lead.confidence = "high";
  assert.equal(validateResearchAnalysis(weak,researchSources).lead.confidence,"low");
  assert.ok(isQualified(researchAnalysis));
  const mismatch = structuredClone(researchAnalysis); mismatch.lead.components.icpFit = 2;
  assert.equal(isQualified(mismatch),false);
});
test("discovery filters invented websites and quotes before candidate persistence", () => {
  const supported = {name:"Fixture",website:"https://fixture.example.com",sourceId:"source_1",quote:"helps software teams manage their projects"};
  assert.equal(validateDiscovery({summary:"Evidence",candidates:[supported]},researchSources).candidates.length,1);
  assert.equal(validateDiscovery({summary:"Evidence",candidates:[{...supported,website:"https://invented.com"}]},researchSources).candidates.length,0);
  assert.equal(validateDiscovery({summary:"Evidence",candidates:[{...supported,quote:"We employ 100 people"}]},researchSources).candidates.length,0);
  const deceptive = [{...researchSources[0],url:"https://directory.example.com",content:researchSources[0].content + " notfixture.example.com"}];
  assert.equal(validateDiscovery({summary:"Evidence",candidates:[supported]},deceptive).candidates.length,0);
});
test("employee estimates need direct published evidence and confidence only counts cited sources", () => {
  const unsupported = structuredClone(researchAnalysis); unsupported.company.employeeEstimate = "500";
  assert.throws(() => validateResearchAnalysis(unsupported,researchSources),/Unsupported employee estimate/);
  const singleSource = structuredClone(researchAnalysis);
  singleSource.facts = [singleSource.facts[0],singleSource.facts[0],singleSource.facts[0]];
  singleSource.lead.confidence = "high"; singleSource.lead.components.evidenceQuality = 12;
  singleSource.lead.score = calculateLeadScore(singleSource.lead.components);
  assert.notEqual(validateResearchAnalysis(singleSource,researchSources).lead.confidence,"high");
});
test("task mapping executes only supported Stage 4 types and respects completed dependencies", () => {
  for (const type of ["define_target_profile","discover_companies","research_companies","identify_opportunities","score_leads"]) assert.ok(supportsResearchTask(type));
  for (const type of ["generate_outreach","request_approval","send_email","toString","constructor"]) assert.equal(supportsResearchTask(type),false,type);
  const profile = task(1,"define_target_profile"); const discovery = task(2,"discover_companies","pending",["task_1"]);
  assert.equal(nextResearchTask([discovery,profile])?.id, profile.id);
  profile.status = "completed"; assert.equal(nextResearchTask([profile,discovery])?.id, discovery.id);
  discovery.status = "completed"; assert.equal(nextResearchTask([profile,discovery,task(3,"generate_outreach","pending",["task_2"])]),undefined);
});
test("dependencies reject cycles and missing predecessors; successful tasks never rerun automatically", () => {
  assert.throws(() => nextResearchTask([task(1,"define_target_profile","pending",["task_2"]),task(2,"discover_companies","pending",["task_1"])]));
  assert.throws(() => nextResearchTask([task(1,"define_target_profile","pending",["unknown"])]));
  assert.equal(nextResearchTask([task(1,"define_target_profile","completed")]),undefined);
  const failed = task(1,"define_target_profile","failed"); assert.equal(nextResearchTask([failed]),undefined); assert.equal(nextResearchTask([failed],true)?.id,failed.id);
});
test("configured hard ceiling bounds research even for legacy goals requesting hundreds", () => {
  const prior = process.env.MAX_RESEARCH_COMPANIES_PER_WORKFLOW;
  try {
    process.env.MAX_RESEARCH_COMPANIES_PER_WORKFLOW = "5"; assert.equal(researchCompanyLimit(20),5); assert.equal(researchCompanyLimit(3),3);
    process.env.MAX_RESEARCH_COMPANIES_PER_WORKFLOW = "500"; assert.equal(researchCompanyLimit(200),20);
    process.env.MAX_RESEARCH_COMPANIES_PER_WORKFLOW = "invalid"; assert.equal(researchCompanyLimit(200),20);
  } finally { if (prior === undefined) delete process.env.MAX_RESEARCH_COMPANIES_PER_WORKFLOW; else process.env.MAX_RESEARCH_COMPANIES_PER_WORKFLOW = prior; }
});
