import datetime,json,os,subprocess,time
from pathlib import Path
p=Path(__file__).parent
os.environ['CI']='true'
for key in ['DATABASE_URL','TEST_DATABASE_URL']:os.environ.pop(key,None)
results=[];selection=json.loads((p/'selection.json').read_text())
for name,argv in json.loads((p/'commands.json').read_text()):
 start=datetime.datetime.now(datetime.timezone.utc).isoformat();mono=time.monotonic()
 with (p/(name+'.log')).open('xb') as log:code=subprocess.call(argv,stdout=log,stderr=subprocess.STDOUT)
 results.append({'phase':name,'argv':argv,'startedAt':start,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'durationSeconds':time.monotonic()-mono,'exitCode':code})
 (p/'phases.json').write_text(json.dumps(results,indent=2)+'\n')
 if code:raise SystemExit(code)
 if name not in selection['groups']:continue
 report=json.loads((p/(name+'.json')).read_text())
 actualFiles={r['name'] for r in report['testResults']};expectedFiles={str(Path('/workspace/worktrees/complaints-runtime737/apps/web')/x) for x in selection['groups'][name]}
 valid=(report.get('success') is True and report.get('numTotalTests',0)>0 and all(report.get(k)==0 for k in ['numFailedTests','numPendingTests','numTodoTests','numPendingTestSuites']) and report.get('numPassedTests')==report.get('numTotalTests') and actualFiles==expectedFiles and all(r.get('status')=='passed' and r['assertionResults'] and all(a.get('status')=='passed' for a in r['assertionResults']) for r in report['testResults']))
 (p/(name+'-validation.json')).write_text(json.dumps({'valid':valid,'actualFiles':sorted(actualFiles),'expectedFiles':sorted(expectedFiles),'counts':{k:report.get(k) for k in ['numTotalTests','numPassedTests','numFailedTests','numPendingTests','numTodoTests']}},indent=2)+'\n')
 if not valid:raise RuntimeError('Expected exact complete web owners with no skips: '+name)
