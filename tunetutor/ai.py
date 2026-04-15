import boto3
import json
import os

AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "eu-west-2") # London Zone

def generate_chat_explanation(history: list, line_context: str) -> str:
    """
    Calls AWS Bedrock to stream a conversational response about grammar/vocab targeting a specific lyric line.
    """
    try:
        client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
        model_id = "anthropic.claude-3-sonnet-20240229-v1:0"
        
        system_prompt = f"""You are an expert Japanese tutor.
Your student is trying to understand the following line from a song:
"{line_context}"

Rules:
1. Explain the grammar structure, vocabulary, or kanji in the context of this specific line concisely.
2. Reply and explain STRICTLY in English. Never reply in Japanese. Do NOT rewrite or translate entire copyrighted song lyrics. Focus purely on educating the user about the snippet provided.
3. Keep responses very short and conversational. Answer directly in English. Use markdown to format.
4. If the user asks about topics completely unrelated to leaning Japanese, politely refuse to engage and remind them you are a Japanese tutor.
5. Do NOT prepend your response with conversational filler or pleasantries (e.g. "Sure, here is a breakdown of that line:"). Start your explanation immediately in English.
"""
        
        # Convert the history array (e.g. [{"role": "user", "content": "..."}, {"role": "assistant", "content": "... "}])
        messages = history.copy()
        
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 800,
            "system": system_prompt,
            "messages": messages
        }
        
        response = client.invoke_model(
            modelId=model_id,
            body=json.dumps(body)
        )
        
        response_body = json.loads(response.get('body').read())
        return response_body['content'][0]['text']
    except Exception as e:
        print(f"Error invoking AWS Bedrock: {e}")
        return "AWS API Error: Make sure your credentials and region are set correctly."

from concurrent.futures import ThreadPoolExecutor

def _translate_single_line(line: str, client) -> str:
    line = line.strip()
    if not line:
        return ""
    try:
        response = client.translate_text(
            Text=line,
            SourceLanguageCode='ja',
            TargetLanguageCode='en'
        )
        return response.get('TranslatedText', '')
    except Exception as e:
        print(f"Warning: Single line translation failed: {e}")
        return ""

def translate_lyrics_block(lyrics: str) -> list[str]:
    """
    Translates an entire block of lyrics using AWS Translate.
    Uses generic AWS translation API line-by-line to bypass LLM copyright guardrails
    and ensure exact 1:1 line mapping.
    """
    lines = lyrics.split("\n")
    try:
        client = boto3.client("translate", region_name=AWS_REGION)
        
        # We translate line-by-line concurrently to ensure 1:1 mapping and speed.
        translated_lines = []
        with ThreadPoolExecutor(max_workers=10) as executor:
            translated_lines = list(executor.map(lambda l: _translate_single_line(l, client), lines))
            
        return translated_lines
    except Exception as e:
        print(f"Error invoking translation AWS Translate API: {e}")
        return []
