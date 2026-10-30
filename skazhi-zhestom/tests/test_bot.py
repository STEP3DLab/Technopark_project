import importlib.util,sys,unittest,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('cat_bot',Path(__file__).resolve().parents[1]/'telegram/bot.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class FakeApi:
 def __init__(self):self.calls=[]
 def call(self,method,fields=None,files=None):
  self.calls.append((method,fields,files))
  return {'sticker':{'file_id':'cached-id','file_unique_id':'unique-cat'}} if method=='sendSticker' else True
class BotTests(unittest.TestCase):
 def setUp(self):self.api=FakeApi();self.bot=module.Bot(self.api,module.load_items())
 def msg(self,**kwargs):return {'message':{'chat':{'id':7,'type':'private'},**kwargs}}
 def test_text_sends_sticker_and_meaning(self):
  self.bot.handle(self.msg(text='обнять'));self.assertEqual([c[0] for c in self.api.calls],['sendSticker','sendMessage']);self.assertEqual(self.api.calls[-1][1]['text'],'Обнимаю');self.assertTrue(self.api.calls[0][2]['sticker'].is_file())
 def test_known_sticker_is_translated_and_unknown_is_not_invented(self):
  self.bot.state['unique_ids']['known']='thanks';self.bot.handle(self.msg(sticker={'file_unique_id':'known'}));self.assertEqual(self.api.calls[-1][1]['text'],'Спасибо!');self.bot.handle(self.msg(sticker={'file_unique_id':'unknown'}));self.assertIn('неизвестен',self.api.calls[-1][1]['text'])
 def test_cached_file_id_is_reused(self):
  self.bot.send(7,self.bot.by_id['hello']);self.bot.send(7,self.bot.by_id['hello']);self.assertIsNone(self.api.calls[2][2]);self.assertEqual(self.api.calls[2][1]['sticker'],'cached-id')
 def test_callback_responds_only_to_private_owner(self):
  update={'callback_query':{'id':'c1','from':{'id':7},'message':{'chat':{'id':7,'type':'private'}},'data':'cat:bye'}};self.bot.handle(update);self.assertEqual(self.api.calls[-1][1]['text'],'Пока!');self.api.calls.clear();update['callback_query']['from']['id']=8;self.bot.handle(update);self.assertEqual(self.api.calls,[])
 def test_groups_are_ignored(self):
  self.bot.handle({'message':{'chat':{'id':-7,'type':'group'},'text':'привет'}});self.assertEqual(self.api.calls,[])
 def test_multipart_is_valid_and_contains_bytes(self):
  item=self.bot.items[0];body,ctype=module.multipart({'chat_id':7},{'sticker':module.WEB/item['webm']},'test-boundary');self.assertTrue(body.endswith(b'--test-boundary--\r\n'));self.assertIn(b'name="sticker"',body);self.assertIn((module.WEB/item['webm']).read_bytes(),body);self.assertIn('test-boundary',ctype)
 def test_invalid_token_rejected_without_network(self):
  with self.assertRaises(ValueError):module.Api('example')
if __name__=='__main__':unittest.main()
