#!/usr/bin/env python3
"""Discovery-only procurement monitor. Never labels RSS items as verified tenders."""
import datetime as dt
import hashlib
import json
import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT=Path(__file__).resolve().parent
OUT=ROOT/"discovery.json"
QUERIES=[
 'закупка изготовление арт объектов скульптур Москва',
 'тендер изготовление наград статуэток кубков Москва',
 'закупка изготовление выставочной экспозиции декораций Москва',
 'закупка изготовление макетов 3D моделей Россия',
 'закупка изготовление интерьерных панно рельефов Москва',
 'тендер малые архитектурные формы Московская область',
]
POS=re.compile(r'закуп|тендер|аукцион|запрос предлож|изготовлен|поставк|конкурс',re.I)
NEG=re.compile(r'ваканси|продам|купить готов|каталог|магазин|обучени',re.I)
def fetch(query):
    url='https://news.google.com/rss/search?'+urllib.parse.urlencode({'q':query+' when:7d','hl':'ru','gl':'RU','ceid':'RU:ru'})
    req=urllib.request.Request(url,headers={'User-Agent':'TRIFOTI-Discovery/1.0 (+public RSS; no scraping)'})
    with urllib.request.urlopen(req,timeout=18) as r:
        return ET.fromstring(r.read(1500000))
def main():
    previous={}
    if OUT.exists():
        try: previous={x['id']:x for x in json.loads(OUT.read_text('utf-8')).get('items',[])}
        except (ValueError,KeyError,TypeError): pass
    found={}
    errors=[]
    for q in QUERIES:
        try:
            root=fetch(q)
            for item in root.findall('.//channel/item'):
                title=(item.findtext('title') or '').strip()
                link=(item.findtext('link') or '').strip()
                if not title or not link or not POS.search(title) or NEG.search(title):continue
                u=urllib.parse.urlparse(link)
                if u.scheme!='https' or not u.hostname:continue
                key=hashlib.sha256((title.casefold()+'|'+link).encode()).hexdigest()[:20]
                old=previous.get(key,{})
                found[key]={'id':key,'title':title[:250],'url':link,
                    'source':'Google News RSS — discovery, not primary procurement source',
                    'query':q,'published':item.findtext('pubDate') or '',
                    'status':'unverified','budget':None,'deadline':None,
                    'first_seen':old.get('first_seen',dt.datetime.now(dt.timezone.utc).isoformat())}
        except Exception as exc:
            errors.append({'query':q,'error':type(exc).__name__})
    # Keep recently discovered candidates; never erase history just because a feed failed.
    for key,item in previous.items():
        if key not in found and len(found)<500: found[key]=item
    result={'schema':1,'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(),
      'disclaimer':'Discovery candidates only. Verify the official notice, deadline, status and technical specification manually.',
      'sources_attempted':len(QUERIES),'errors':errors,'items':list(found.values())[:500]}
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf-8')
    print('discovered:',len(found),'errors:',len(errors))
if __name__=='__main__':main()
