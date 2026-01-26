# Pagination

The LangSmith Java SDK provides convenient utilities for working with paginated API responses.

## Auto-Pagination

Automatically iterate through all results across multiple pages.

### Synchronous

::: com.langchain.smith.core.AutoPager
options:
show_if_no_docstring: true

::: com.langchain.smith.core.Page
options:
show_if_no_docstring: true

### Asynchronous

::: com.langchain.smith.core.AutoPagerAsync
options:
show_if_no_docstring: true

::: com.langchain.smith.core.PageAsync
options:
show_if_no_docstring: true

## Usage Examples

### Synchronous Auto-Pagination

```java
import com.langchain.smith.models.datasets.Dataset;
import com.langchain.smith.models.datasets.DatasetListPage;

DatasetListPage page = client.datasets().list();

// Process as an Iterable
for (Dataset dataset : page.autoPager()) {
    System.out.println(dataset);
}

// Process as a Stream
page.autoPager()
    .stream()
    .limit(50)
    .forEach(dataset -> System.out.println(dataset));
```

### Asynchronous Auto-Pagination

```java
import com.langchain.smith.models.datasets.Dataset;
import com.langchain.smith.models.datasets.DatasetListPageAsync;
import java.util.concurrent.CompletableFuture;

CompletableFuture<DatasetListPageAsync> pageFuture = client.async().datasets().list();

pageFuture.thenRun(page -> page.autoPager().subscribe(dataset -> {
    System.out.println(dataset);
}));
```

### Manual Pagination

```java
import com.langchain.smith.models.datasets.Dataset;
import com.langchain.smith.models.datasets.DatasetListPage;

DatasetListPage page = client.datasets().list();
while (true) {
    for (Dataset dataset : page.items()) {
        System.out.println(dataset);
    }

    if (!page.hasNextPage()) {
        break;
    }

    page = page.nextPage();
}
```
