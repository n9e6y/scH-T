from fastapi import HTTPException


class ApiError(HTTPException):
    def __init__(self, status: int, code: str, message_fa: str):
        super().__init__(status_code=status, detail={"code": code, "message_fa": message_fa})


def not_found(what: str = "مورد") -> ApiError:
    return ApiError(404, "not_found", f"{what} پیدا نشد.")
