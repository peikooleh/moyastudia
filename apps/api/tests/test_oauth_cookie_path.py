from starlette.responses import Response

from app.security import clear_oauth_state_cookie, oauth_state_cookie_name, set_oauth_state_cookie


def test_oauth_state_cookie_is_available_to_public_api_prefix():
    response = Response()
    set_oauth_state_cookie(response, "state-value", "browser-binding")
    header = response.headers["set-cookie"]
    assert f"{oauth_state_cookie_name('state-value')}=browser-binding" in header
    assert "Path=/" in header
    assert "HttpOnly" in header
    assert "SameSite=lax" in header


def test_oauth_state_cookie_clear_uses_same_root_path():
    response = Response()
    clear_oauth_state_cookie(response, "state-value")
    header = response.headers["set-cookie"]
    assert "Path=/" in header
    assert "Max-Age=0" in header
