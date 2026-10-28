"""Build the offline OSM test-corridor graph. Input: public Overpass JSON, not GPS traces."""
import json,math,heapq,hashlib,sys,collections,pathlib
source=pathlib.Path(sys.argv[1]);raw=source.read_bytes();data=json.loads(raw)
assert not data.get('remark'),data.get('remark')
nodes={x['id']:x for x in data['elements'] if x['type']=='node'};ways=[w for w in data['elements'] if w['type']=='way']
assert all(n in nodes for w in ways for n in w['nodes'])
def dist(a,b):
 a,b=nodes[a],nodes[b];r=math.pi/180;h=math.sin((b['lat']-a['lat'])*r/2)**2+math.cos(a['lat']*r)*math.cos(b['lat']*r)*math.sin((b['lon']-a['lon'])*r/2)**2
 return 12742000*math.asin(min(1,math.sqrt(h)))
def dirs(w):
 t=w['tags'];v=t.get('oneway','yes' if t.get('highway') in ['motorway','motorway_link'] or t.get('junction')=='roundabout' else 'no')
 return [-1] if v=='-1' else [1] if v in ['yes','1','true'] else [1,-1]
motor=[w for w in ways if w.get('tags',{}).get('highway') in ['motorway','motorway_link'] and w['tags'].get('access') not in ['no','private']]
adj=collections.defaultdict(list)
for w in motor:
 for a,b in zip(w['nodes'],w['nodes'][1:]):
  length=dist(a,b)
  for d in dirs(w):x,y=(a,b) if d==1 else(b,a);adj[x].append((y,length,w['id']))
def shortest(starts,ends):
 heap=[(0,n) for n in starts];best={n:0 for n in starts};parent={}
 while heap:
  cost,n=heapq.heappop(heap)
  if cost!=best[n]:continue
  if n in ends:
   path=[]
   while n in parent:
    n,w=parent[n]
    if not path or path[-1]!=w:path.append(w)
   return cost,list(reversed(path))
  for nxt,l,w in adj[n]:
   c=cost+l
   if c<best.get(nxt,float('inf')):best[nxt]=c;parent[nxt]=(n,w);heapq.heappush(heap,(c,nxt))
 raise Exception('Corridor not connected: '+str(starts)+' -> '+str(ends))
gates={}
for n,x in nodes.items():
 name=x.get('tags',{}).get('name','')
 if x.get('tags',{}).get('highway')=='motorway_junction' and name in ['Genova Aeroporto','Genova Bolzaneto','Rapallo']:gates.setdefault(name,[]).append(n)
assert set(gates)=={'Genova Aeroporto','Genova Bolzaneto','Rapallo'}
selected=set();routes=[]
for a,b in [('Genova Aeroporto','Rapallo'),('Rapallo','Genova Aeroporto'),('Genova Aeroporto','Genova Bolzaneto'),('Genova Bolzaneto','Genova Aeroporto'),('Genova Bolzaneto','Rapallo'),('Rapallo','Genova Bolzaneto')]:
 length,path=shortest(gates[a],set(gates[b]));selected.update(path);routes.append({'from':a,'to':b,'metres':round(length),'ways':path})
# Include motorway-link chains attached to the selected corridor, up to their surface-road ends.
wayIndex={w['id']:w for w in motor};connected={n for i in selected for n in wayIndex[i]['nodes']};changed=True
while changed:
 changed=False
 for w in motor:
  if w['id'] not in selected and w['tags'].get('highway')=='motorway_link' and any(n in connected for n in w['nodes']):
   selected.add(w['id']);connected.update(w['nodes']);changed=True
# All roads in the area, not only motorways: conservative alternative-path search.
counts=collections.Counter(n for w in ways for n in set(w['nodes']));cuts={n for n,c in counts.items() if c>1}|{n for w in ways for n in [w['nodes'][0],w['nodes'][-1]]}
graphNodes=sorted(cuts);index={n:i for i,n in enumerate(graphNodes)};edges=[];bbox=[44.30,8.76,44.54,9.31]
for w in ways:
 ids=w['nodes'];start=0
 for j in range(1,len(ids)):
  if ids[j] not in cuts:continue
  part=ids[start:j+1];length=sum(dist(a,b) for a,b in zip(part,part[1:]));near=any(nodes[n]['lat']<bbox[0]+.005 or nodes[n]['lat']>bbox[2]-.005 or nodes[n]['lon']<bbox[1]+.007 or nodes[n]['lon']>bbox[3]-.007 for n in part)
  for d in dirs(w):a,b=(part[0],part[-1]) if d==1 else(part[-1],part[0]);edges.append([index[a],index[b],round(length,2),w['id'],1 if near else 0])
  start=j
# Connected tunnel way chains; stop at branches. Do not splice geometries by pixels or distance.
pool=[w for w in motor if w['tags'].get('tunnel')=='yes'];oriented=[]
for w in pool:
 for direction in dirs(w):oriented.append({'w':w,'ids':w['nodes'][::direction]})
byStart=collections.defaultdict(list);byEnd=collections.defaultdict(list)
for k,w in enumerate(oriented):byStart[w['ids'][0]].append(k);byEnd[w['ids'][-1]].append(k)
used=set();candidates=[]
for k,o in enumerate(oriented):
 if k in used:continue
 first=k;guard=set()
 while len(byEnd[oriented[first]['ids'][0]])==1:
  prev=byEnd[oriented[first]['ids'][0]][0]
  if prev in guard or len(byStart[oriented[prev]['ids'][-1]])!=1:break
  guard.add(first);first=prev
 chain=[];current=first
 while current not in used:
  used.add(current);chain.append(current);end=oriented[current]['ids'][-1]
  if len(byStart[end])!=1 or len(byEnd[end])!=1:break
  current=byStart[end][0]
 ws=[oriented[j]['w'] for j in chain]
 if not any(w['id'] in selected for w in ws):continue
 ids=[]
 for j in chain:ids.extend(oriented[j]['ids'] if not ids else oriented[j]['ids'][1:])
 own={w['id'] for w in ws};internal=set(ids[1:-1]);branch=any(e[3] not in own and (graphNodes[e[0]] in internal or graphNodes[e[1]] in internal) for e in edges)
 names=list(dict.fromkeys(w['tags'].get('tunnel:name') or w['tags'].get('name') or 'Galleria OSM '+str(w['id']) for w in ws))
 candidates.append({'id':'osm-'+str(ws[0]['id'])+'-'+str(ids[0]),'name':' / '.join(names),'wayIds':sorted(own),'entry':index[ids[0]],'exit':index[ids[-1]],'geometry':[[nodes[n]['lat'],nodes[n]['lon']] for n in ids],'metres':round(sum(dist(a,b) for a,b in zip(ids,ids[1:])),2),'branch':branch,'refs':list(dict.fromkeys(w['tags'].get('ref','raccordo') for w in ws))})
assert candidates and all(len(t['geometry'])>=2 for t in candidates)
pack={'version':1,'id':'osm-genova-rapallo-bolzaneto-'+data['osm3s']['timestamp_osm_base'][:10],'source':'OpenStreetMap / Overpass API','license':'ODbL-1.0','attribution':'© OpenStreetMap contributors','sourceUrl':'https://www.openstreetmap.org/copyright','timestamp':data['osm3s']['timestamp_osm_base'],'sourceSha256':hashlib.sha256(raw).hexdigest(),'bbox':bbox,'coverage':routes,'nodes':[[nodes[n]['lat'],nodes[n]['lon']] for n in graphNodes],'edges':edges,'tunnels':candidates,'validation':{'ways':len(ways),'missingNodes':0,'responseTruncated':False,'candidateWays':len(set(w for t in candidates for w in t['wayIds']))}}
out=pathlib.Path('tunnel-map-data.js');out.write_text('/* OpenStreetMap contributors, ODbL 1.0. Source and reproducible build: tunnel-reconstruction-rollout.md */\n(function(r){r.TunnelMapData='+json.dumps(pack,ensure_ascii=False,separators=(',',':'))+';})(typeof window!=="undefined"?window:globalThis);\n',encoding='utf-8')
print(json.dumps({'bytes':out.stat().st_size,'graphNodes':len(graphNodes),'edges':len(edges),'tunnels':len(candidates),'branchRejected':sum(t['branch'] for t in candidates),'coverage':[{'from':r['from'],'to':r['to'],'metres':r['metres']} for r in routes],'names':[t['name'] for t in candidates]},ensure_ascii=False))
