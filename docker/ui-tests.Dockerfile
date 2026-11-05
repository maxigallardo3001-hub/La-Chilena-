FROM mcr.microsoft.com/playwright/python:v1.49.1-noble
WORKDIR /tests
RUN pip install --no-cache-dir playwright==1.49.1
COPY tests/ui.py /tests/ui.py
CMD ["python", "ui.py"]
