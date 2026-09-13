"""Compose a 30-second launch trailer from the local renderer's 900 frames.
Original synthesized score; game-owned impact samples; no external music.
"""
from pathlib import Path
import math, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'render'; OUT.mkdir(exist_ok=True)
SR=48000; DUR=30; rng=np.random.default_rng(82)
audio=np.zeros((SR*DUR,2),np.float64)
def add(signal,start,level=1,pan=0):
    i=round(start*SR)
    if i>=len(audio):return
    s=np.asarray(signal)[:len(audio)-i]*level
    if s.ndim==1:s=np.column_stack([s*math.sqrt((1-pan)/2),s*math.sqrt((1+pan)/2)])
    audio[i:i+len(s)]+=s

def note(midi,seconds,pluck=False):
    t=np.arange(round(seconds*SR))/SR; f=440*2**((midi-69)/12)
    if pluck:
        y=(np.sin(2*np.pi*f*t)+.28*np.sin(2*np.pi*2*f*t)+.1*np.sin(2*np.pi*3*f*t))*np.exp(-t*5.4)
        env=np.minimum(t/.008,1)*np.minimum((seconds-t)/.12,1)
    else:
        y=sum(np.sin(2*np.pi*f*det*t+phase) for det,phase in [(1,0),(1.002,.7),(.998,1.8)])/3
        y+=.12*np.sin(2*np.pi*f*2*t)
        env=np.minimum(t/.6,1)*np.minimum((seconds-t)/1.1,1)
    return y*np.maximum(0,env)
# Airy D minor / B-flat / F / C voicings.
chords=[[50,57,62,65,69],[46,53,58,62,65],[41,53,57,60,65],[48,55,60,64,67]]
for j,start in enumerate(np.arange(0,29,4)):
    for k,midi in enumerate(chords[j%4]):add(note(midi,5),float(start),.063,(-.6+.3*k))
# Plucked constellation motif, with alternating stereo echoes.
seq=[74,81,77,69,74,77,84,81]
for j,start in enumerate(np.arange(1,28,.25)):
    if 18.7<start<20:continue
    sig=note(seq[j%8],1.25,True)
    level=.085 if 5<=start<19 else .05
    add(sig,float(start),level,.45 if j%2 else -.45)
    add(sig,float(start+.375),level*.27,-.45 if j%2 else .45)
    add(sig,float(start+.75),level*.12,0)
# Rounded low pulse, kick, muted clap and light hats.
for start in np.arange(5,25,.5):
    t=np.arange(int(.35*SR))/SR
    kick=np.sin(2*np.pi*(48*t+7*(1-np.exp(-t*35))))*np.exp(-t*13)
    level=.32 if start<19 else .16
    add(kick,float(start),level)
    root=[38,34,29,36][int((start-5)//4)%4]
    add(note(root,.45,True),float(start),.20)
    if round((start-5)*2)%2:
        noise=rng.normal(size=int(.15*SR)); tt=np.arange(len(noise))/SR
        snap=(noise-np.roll(noise,1))*.45*np.exp(-tt*35)
        add(snap,float(start),.09)
for j,start in enumerate(np.arange(5.25,24.8,.25)):
    t=np.arange(int(.065*SR))/SR; n=rng.normal(size=len(t)); hat=(n-np.roll(n,1))*np.exp(-t*70)
    add(hat,float(start),.018 if j%2 else .029,.4 if j%2 else -.4)
# Transition breaths and a low final resolve.
for start,duration in [(3.6,1.4),(10.55,.45),(14.55,.45),(18.25,.75),(24,1)]:
    t=np.arange(int(duration*SR))/SR; n=rng.normal(size=len(t)); smooth=np.convolve(n,np.ones(35)/35,mode='same')
    swell=np.sin(np.pi*t/(2*duration))**2
    add(smooth*swell,float(start),.26)
for midi in [38,50,57,62,65,69]:add(note(midi,4.9),25,.1)
# Familiar, crisp pool impacts aligned to the filmed breaks.
def sample(name,start,level=1,pan=0):
    path=ROOT.parent.parent/'public/sfx'/name
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-ac','1','-ar',str(SR),'-'])
    add(np.frombuffer(raw,dtype=np.float32),start,level,pan)
for start in [5.3,11.267,15.267]:
    sample('cueTip_1.wav',start,.65,-.1)
    for delay,lev,pan in [(.14,.55,0),(.18,.35,.35),(.24,.25,-.35),(.36,.2,.5),(.6,.14,-.2)]:
        sample('ballBall_hard_0.wav',start+delay,lev,pan)
    sample('cushion_0.wav',start+.55,.3,.5)
# Gentle stereo room tail, no clipping, half-second entrance and one-second exit.
dry=audio.copy()
for delay,level in [(.13,.08),(.27,.055),(.41,.035)]:
    d=int(delay*SR);audio[d:]+=dry[:-d,::-1]*level
fade=np.ones(len(audio));fade[:int(.3*SR)]=np.linspace(0,1,int(.3*SR));fade[-int(1.2*SR):]=np.linspace(1,0,int(1.2*SR))
audio*=fade[:,None];audio=np.tanh(audio*1.1);audio*=.89/max(abs(audio).max(),.89)
with wave.open(str(OUT/'soundtrack.wav'),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((audio*32767).astype('<i2').tobytes())
# Transparent editorial typography layers at native 1080p resolution.
FONT='/System/Library/Fonts/Supplemental/'
serif=lambda n:ImageFont.truetype(FONT+'Baskerville.ttc',n)
sans=lambda n:ImageFont.truetype(FONT+'Arial.ttf',n)
bold=lambda n:ImageFont.truetype(FONT+'Arial Bold.ttf',n)
cream=(248,246,235,255);cyan=(147,227,240,255)
def layer(name,headline,sub,eyebrow=None,end=False):
    im=Image.new('RGBA',(1920,1080)); d=ImageDraw.Draw(im)
    # Soft lower gradient keeps copy readable without a panel over the game.
    if not end:
        for y in range(1080):
            a=int(160*max(0,(y-520)/560)**1.35)
            d.line((0,y,1920,y),fill=(3,10,17,a))
        d.line((110,792,184,792),fill=cyan,width=3)
        d.text((110,815),headline,font=serif(78),fill=cream)
        d.text((113,923),sub,font=sans(29),fill=cyan)
        if eyebrow:d.text((110,90),eyebrow,font=bold(22),fill=cream,stroke_width=1,stroke_fill=(0,0,0,80))
    else:
        d.rectangle((0,0,1920,1080),fill=(3,10,18,155))
        def centered(y,text,font,color):
            box=d.textbbox((0,0),text,font=font);d.text(((1920-(box[2]-box[0]))/2,y),text,font=font,fill=color)
        centered(248,'Astra Pool',serif(164),cream)
        centered(450,'Your next break is out there.',sans(36),cream)
        d.line((884,554,1036,554),fill=cyan,width=2)
        centered(613,'PLAY NOW',bold(25),cyan)
        centered(669,'astrapool.darrinm.com',sans(48),cream)
        centered(792,'No install. No account.',sans(27),(213,225,227,255))
    im.save(OUT/f'{name}.png')
layer('intro','Rack the solar system.','A different kind of pool night.','ASTRA POOL  /  LAUNCH TRAILER')
layer('break','Make your break.','Real 3D pool. Every angle is yours.')
layer('desert','Find your table.','Nine places to play.')
layer('tokyo','Bring a challenger.','Play a friend online or take on the computer.')
layer('gravity','Bend the game.','Optional Black Hole Gravity changes the shot.')
layer('end','','',end=True)
# Each title fades in and out; footage cuts on the musical grid.
segments=[('intro',0,5),('break',5,6),('desert',11,4),('tokyo',15,4),('gravity',19,6),('end',25,5)]
cmd=['ffmpeg','-hide_banner','-loglevel','warning','-y','-framerate','30','-i',str(OUT/'frames/%05d.jpg'),'-i',str(OUT/'soundtrack.wav')]
for name,_,_ in segments:cmd+=['-loop','1','-framerate','30','-i',str(OUT/f'{name}.png')]
f=['[0:v]scale=in_range=full:out_range=tv,eq=contrast=1.025:saturation=1.07:brightness=0.006[v0]']
for i,(name,start,dur) in enumerate(segments):
    idx=i+2
    f.append(f'[{idx}:v]format=rgba,fade=t=in:st=0:d=0.35:alpha=1,fade=t=out:st={dur-.3}:d=0.3:alpha=1,setpts=PTS+{start}/TB[t{i}]')
    f.append(f'[v{i}][t{i}]overlay=enable=\'between(t,{start},{start+dur})\':eof_action=pass[v{i+1}]')
f.append('[v6]fade=t=in:st=0:d=0.35,fade=t=out:st=29.5:d=0.5,format=yuv420p[video]')
cmd+=['-filter_complex',';'.join(f),'-map','[video]','-map','1:a','-t','30','-r','30','-c:v','libx264','-preset','slow','-crf','18','-c:a','aac','-b:a','256k','-ar','48000','-af','loudnorm=I=-16:TP=-1.5:LRA=8','-movflags','+faststart','-metadata','title=Astra Pool — Launch Trailer',str(ROOT/'astra-pool-launch-trailer.mp4')]
print('Composing 1080p trailer…',flush=True)
subprocess.run(cmd,check=True)
print(ROOT/'astra-pool-launch-trailer.mp4')
