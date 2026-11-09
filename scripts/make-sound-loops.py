# 배경 소리 녹음을 끊김 없는 루프로 만들어요. 출처는 public/sounds/SOURCES.md
import numpy as np, subprocess, json, os
# 쓰는 법: 저장소 맨 위에서 python3 scripts/make-sound-loops.py (numpy, ffmpeg 필요)
# sounds-raw/<id>.mp3 (Freesound에서 받은 원본, git에 안 올림) → public/sounds/<id>.mp3 (반복 재생용 루프)
R='sounds-raw'; O='public/sounds'; os.makedirs(O,exist_ok=True)
SR=44100; XF=4.0
# 소리별로 고른 구간(시작초, 길이초): 큰 돌발음이 적은 곳
WIN={'cafe':(104,46),'typing':(2,60),'fire':(60,60),'fireplace':(2,60),'forest':(30,60),
     'library':(96,60),'night':(18,60),'ocean':(40,60),'rain':(125,55),'stream':(2,50),'clock':(2,58)}
def load(n):
    raw=subprocess.run(['ffmpeg','-v','error','-i',f'{R}/{n}.mp3','-ac','1','-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(raw,dtype=np.float32).astype(np.float64)
def loop_xfade(seg, xf):
    # 끝의 xf초를 처음 xf초와 겹쳐요: 끝에서 처음으로 돌아갈 때 이어지는 소리가 같아요
    n=int(xf*SR); body=seg[:-n].copy(); tail=seg[-n:]
    t=np.linspace(0,1,n); fin=np.sqrt(t); fout=np.sqrt(1-t)   # 같은 파워 크로스페이드
    body[:n]=body[:n]*fin+tail*fout
    return body
def clock_loop(x, start, length):
    # 째깍 소리 시작점에 맞춰 잘라요 (겹치면 박자가 두 번 들려서)
    s=x[int(start*SR):int((start+length)*SR)]
    env=np.convolve(np.abs(s),np.ones(220)/220,'same')
    th=np.percentile(env,99.5)*0.5
    on=[]; i=0
    while i<len(env):
        if env[i]>th: on.append(i); i+=int(0.3*SR)
        else: i+=1
    first, last = on[0], on[-1]
    pre=int(0.01*SR)
    xf=0.02
    seg=s[first-pre:last-pre+int(xf*SR)]
    return loop_xfade(seg, xf), len(on), np.diff(on).mean()/SR
info={}
for k,(st,ln) in WIN.items():
    x=load(k)
    if k=='clock':
        y,cnt,per=clock_loop(x,st,ln); info[k]={'ticks':cnt,'period':round(per,3)}
    else:
        y=loop_xfade(x[int(st*SR):int((st+ln)*SR)],XF)
    y=y-np.mean(y)
    # 이어지는 자리(파일 끝→처음)를 가장 조용한 순간으로 옮겨요. 원형이라 돌려도 이음매는 그대로 매끄러워요
    w=int(0.05*SR); e=np.convolve(y**2,np.ones(w),'same'); e[:w]=e[-w:]=np.inf
    y=np.roll(y,-int(np.argmin(e)))
    open(f'{O}/{k}.f32','wb').write(y.astype(np.float32).tobytes())
    # 크기 맞추기(-23 LUFS) 후 모노 mp3
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','1','-i',f'{O}/{k}.f32',
      '-af','loudnorm=I=-23:TP=-2:LRA=20:linear=true','-ar',str(SR),'-c:a','libmp3lame','-b:a','96k',f'{O}/{k}.mp3'],check=True)
    os.remove(f'{O}/{k}.f32')
    info.setdefault(k,{})['sec']=round(len(y)/SR,2); info[k]['kb']=os.path.getsize(f'{O}/{k}.mp3')//1024
print(json.dumps(info))
