import http from "k6/http";
import {check,sleep} from "k6";

export const options={stages:[{duration:"30s",target:10},{duration:"1m",target:50},{duration:"2m",target:50},{duration:"30s",target:0}],thresholds:{http_req_failed:["rate<0.01"],http_req_duration:["p(95)<1500"],checks:["rate>0.99"]}};
const base=__ENV.BASE_URL||"http://localhost:3000";
export default function loadScenario(){
  const health=http.get(`${base}/api/v1/health`);check(health,{"health 200":(response)=>response.status===200});
  const protocols=http.get(`${base}/api/v1/protocols?pageSize=20`);check(protocols,{"protocol list authorized or demo":(response)=>response.status===200||response.status===401});
  const indicators=http.get(`${base}/api/v1/indicators?pageSize=20`);check(indicators,{"indicator list authorized or demo":(response)=>response.status===200||response.status===401});sleep(1);
}
